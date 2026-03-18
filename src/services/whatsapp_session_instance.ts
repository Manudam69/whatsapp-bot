import fs from 'fs'
import path from 'path'
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  WAMessage,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import qrcode from 'qrcode-terminal'
import { config } from '@/config'
import logger from '@/utils/logger'
import { getPhoneNumberFromJid } from '@/utils/phone'

export type SessionState = {
  status: 'idle' | 'connecting' | 'qr' | 'connected' | 'disconnected'
  qr?: string
  connectedAt?: Date
  phoneNumber?: string
}

const GROUP_SYNC_INITIAL_DELAY_MS = 5000
const GROUP_SYNC_INTERVAL_MS = 5 * 60 * 1000
const GROUP_SYNC_RATE_LIMIT_DELAY_MS = 60000

function createSilentBaileysLogger() {
  const silentLogger = {
    level: 'silent',
    child() { return silentLogger },
    trace() {},
    debug() {},
    info() {},
    warn() {},
    error() {},
  }
  return silentLogger
}

const baileysLogger = createSilentBaileysLogger()

export class WhatsappSessionInstance {
  readonly sessionId: string
  readonly clientId: string
  readonly authDirKey: string

  private socket?: ReturnType<typeof makeWASocket>
  private state: SessionState = { status: 'idle' }
  private starting = false
  private allowReconnect = true
  private groupSyncTimer?: NodeJS.Timeout
  private syncingGroups = false

  constructor(params: { sessionId: string; clientId: string; authDirKey: string }) {
    this.sessionId = params.sessionId
    this.clientId = params.clientId
    this.authDirKey = params.authDirKey
  }

  async start(): Promise<SessionState> {
    if (this.starting || this.socket) {
      return this.state
    }

    this.starting = true
    this.allowReconnect = true
    this.state = { status: 'connecting' }

    try {
      const authDir = this.getAuthDir()
      fs.mkdirSync(authDir, { recursive: true })

      const { state, saveCreds } = await useMultiFileAuthState(authDir)
      const { version } = await fetchLatestBaileysVersion()

      this.socket = makeWASocket({
        version,
        auth: state,
        logger: baileysLogger,
        syncFullHistory: true,
        markOnlineOnConnect: false,
        browser: ['Whatsapp Operations Bot', 'Chrome', '1.0.0'],
      })

      this.socket.ev.on('creds.update', saveCreds)
      this.socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update

        if (qr) {
          this.state = { status: 'qr', qr }
          qrcode.generate(qr, { small: true })
          logger.info(`[Session ${this.sessionId}] QR updated.`)
          await this.persistStatus('qr', null)
        }

        if (connection === 'open') {
          const phoneNumber = getPhoneNumberFromJid(this.socket?.user?.id)
          this.state = { status: 'connected', connectedAt: new Date(), phoneNumber }
          logger.info(`[Session ${this.sessionId}] Connected as ${phoneNumber}`)
          await this.persistStatus('connected', phoneNumber ?? null)

          const { antibanService } = await import('./antiban.service')
          antibanService.onReconnect()

          const { whatsappIdentityService } = await import('./whatsapp_identity.service')
          await whatsappIdentityService.repairStoredContacts(this.sessionId, phoneNumber)

          await this.scheduleInitialGroupSync()

          const { outboundMessageService } = await import('./outbound_message.service')
          await outboundMessageService.flushPending(this.sessionId)
        }

        if (connection === 'close') {
          this.clearGroupSyncTimer()
          this.socket = undefined
          const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode
          const disconnectedByLogout = statusCode === DisconnectReason.loggedOut
          const shouldReconnect = this.allowReconnect && !disconnectedByLogout
          this.state = { status: 'disconnected' }
          await this.persistStatus('disconnected', null)

          const { antibanService } = await import('./antiban.service')
          antibanService.onDisconnect(statusCode)

          logger.warn(`[Session ${this.sessionId}] Closed. reconnect=${shouldReconnect}`)

          if (shouldReconnect) {
            await this.start()
          }
        }
      })

      this.socket.ev.on('messages.upsert', async (event) => {
        if (event.type !== 'notify' && event.type !== 'append') {
          return
        }

        // Flood guard: only process latest message per JID in a batch
        const latestByJid = new Map<string, WAMessage>()
        for (const message of event.messages) {
          const jid = message.key.remoteJid
          if (jid && !message.key.fromMe && !jid.endsWith('@g.us')) {
            latestByJid.set(jid, message)
          }
        }

        for (const message of latestByJid.values()) {
          await this.handleMessage(message)
        }
      })

      return this.state
    } catch (error) {
      this.socket = undefined
      this.state = { status: 'disconnected' }
      throw error
    } finally {
      this.starting = false
    }
  }

  async stop(): Promise<SessionState> {
    this.allowReconnect = false
    this.clearGroupSyncTimer()

    if (this.socket) {
      this.socket.end(new Error('Session closed manually'))
      this.socket = undefined
    }

    this.state = { status: 'disconnected' }
    await this.persistStatus('disconnected', null)
    return this.state
  }

  async reset(): Promise<SessionState> {
    await this.stop()

    const authDir = this.getAuthDir()
    fs.rmSync(authDir, { recursive: true, force: true })
    fs.mkdirSync(authDir, { recursive: true })

    logger.info(`[Session ${this.sessionId}] Auth state cleared. Restarting.`)

    return this.start()
  }

  getSessionState(): SessionState {
    return this.state
  }

  isConnected(): boolean {
    return Boolean(this.socket) && this.state.status === 'connected'
  }

  getConnectedPhoneNumber(): string {
    return this.isConnected() ? this.state.phoneNumber || '' : ''
  }

  async sendText(jid: string, text: string): Promise<void> {
    await this.sendTextNow(jid, text)
  }

  async sendMedia(jid: string, filePath: string, caption?: string): Promise<void> {
    await this.sendMediaNow(jid, filePath, caption)
  }

  async sendTyping(jid: string): Promise<void> {
    try {
      await this.socket?.sendPresenceUpdate('composing', jid)
    } catch {
      // Best-effort
    }
  }

  async sendTextNow(jid: string, text: string): Promise<string | undefined> {
    if (!this.socket) {
      throw new Error('WhatsApp session is not connected')
    }
    const result = await this.socket.sendMessage(jid, { text })
    return result?.key?.id ?? undefined
  }

  async sendMediaNow(jid: string, filePath: string, caption?: string): Promise<string | undefined> {
    if (!this.socket) {
      throw new Error('WhatsApp session is not connected')
    }
    const result = await this.socket.sendMessage(jid, {
      image: { url: filePath },
      caption,
    })
    return result?.key?.id ?? undefined
  }

  async deleteMessageNow(jid: string, messageId: string): Promise<void> {
    if (!this.socket) {
      throw new Error('WhatsApp session is not connected')
    }
    await this.socket.sendMessage(jid, {
      delete: { remoteJid: jid, id: messageId, fromMe: true },
    })
  }

  async syncGroups(): Promise<unknown[]> {
    if (!this.socket || !this.isConnected()) {
      return []
    }

    if (this.syncingGroups) {
      return []
    }

    this.syncingGroups = true

    try {
      const groups = await this.socket.groupFetchAllParticipating()
      const mapped = Object.values(groups).map((group) => ({
        jid: group.id,
        name: group.subject,
        participantCount: group.participants.length,
      }))

      const { groupService } = await import('./group.service')
      const syncedGroups = await groupService.upsertGroups(this.sessionId, mapped)
      this.scheduleGroupSync(GROUP_SYNC_INTERVAL_MS)
      return syncedGroups
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      if (message.toLowerCase().includes('rate-overlimit')) {
        logger.warn(`[Session ${this.sessionId}] Group sync rate limited. Retrying in ${GROUP_SYNC_RATE_LIMIT_DELAY_MS / 1000}s.`)
        this.scheduleGroupSync(GROUP_SYNC_RATE_LIMIT_DELAY_MS)
        return []
      }

      logger.error(`[Session ${this.sessionId}] Group sync failed: ${message}`)
      this.scheduleGroupSync(GROUP_SYNC_INTERVAL_MS)
      return []
    } finally {
      this.syncingGroups = false
    }
  }

  private async scheduleInitialGroupSync(): Promise<void> {
    const { groupService } = await import('./group.service')
    const latestSyncAt = await groupService.getLatestSyncAt(this.sessionId)

    if (!latestSyncAt) {
      this.scheduleGroupSync()
      return
    }

    const elapsedMs = Date.now() - latestSyncAt.getTime()
    if (elapsedMs >= GROUP_SYNC_INTERVAL_MS) {
      this.scheduleGroupSync()
      return
    }

    const delayMs = Math.max(GROUP_SYNC_INITIAL_DELAY_MS, GROUP_SYNC_INTERVAL_MS - elapsedMs)
    logger.info(`[Session ${this.sessionId}] Skipping immediate group sync. Next in ${Math.ceil(delayMs / 1000)}s.`)
    this.scheduleGroupSync(delayMs)
  }

  private scheduleGroupSync(delayMs = GROUP_SYNC_INITIAL_DELAY_MS): void {
    this.clearGroupSyncTimer()
    this.groupSyncTimer = setTimeout(() => {
      void this.syncGroups()
    }, delayMs)
  }

  private clearGroupSyncTimer(): void {
    if (this.groupSyncTimer) {
      clearTimeout(this.groupSyncTimer)
      this.groupSyncTimer = undefined
    }
  }

  getAuthDir(): string {
    return path.resolve(process.cwd(), config.SESSION_AUTH_DIR, this.authDirKey)
  }

  private async handleMessage(message: WAMessage): Promise<void> {
    const remoteJid = message.key.remoteJid
    if (!remoteJid || message.key.fromMe || remoteJid.endsWith('@g.us')) {
      return
    }

    const text = this.extractText(message)
    if (!text) {
      return
    }

    const { inboundMessageService } = await import('./inbound_message.service')
    await inboundMessageService.processIncomingText({
      sessionId: this.sessionId,
      clientId: this.clientId,
      authDirKey: this.authDirKey,
      fromJid: remoteJid,
      text,
      externalMessageId: message.key.id || undefined,
      contactName: message.pushName || undefined,
      rawPayload: message as unknown as Record<string, unknown>,
    })
  }

  private extractText(message: WAMessage): string {
    const content = message.message
    if (!content) {
      return ''
    }

    if ('conversation' in content && content.conversation) {
      return content.conversation
    }
    if ('extendedTextMessage' in content && content.extendedTextMessage?.text) {
      return content.extendedTextMessage.text
    }
    if ('imageMessage' in content && content.imageMessage?.caption) {
      return content.imageMessage.caption
    }

    return ''
  }

  private async persistStatus(status: string, phoneNumber: string | null): Promise<void> {
    try {
      const { AppDataSource } = await import('@/database/datasource')
      await AppDataSource.query(
        `UPDATE "whatsapp_sessions" SET "status" = $1, "phone_number" = $2, "connected_at" = $3, "updated_at" = now() WHERE "id" = $4`,
        [status, phoneNumber, status === 'connected' ? new Date() : null, this.sessionId],
      )
    } catch (err) {
      logger.warn(`[Session ${this.sessionId}] Failed to persist status: ${err instanceof Error ? err.message : err}`)
    }
  }
}
