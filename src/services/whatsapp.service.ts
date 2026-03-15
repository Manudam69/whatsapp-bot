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
import { inboundMessageService } from './inbound_message.service'
import { groupService } from './group.service'
import { whatsappIdentityService } from './whatsapp_identity.service'

function createSilentBaileysLogger() {
  const silentLogger = {
    level: 'silent',
    child() {
      return silentLogger
    },
    trace() {},
    debug() {},
    info() {},
    warn() {},
    error() {},
  }

  return silentLogger
}

const baileysLogger = createSilentBaileysLogger()
const GROUP_SYNC_INITIAL_DELAY_MS = 5000
const GROUP_SYNC_RATE_LIMIT_DELAY_MS = 60000

type SessionState = {
  status: 'idle' | 'connecting' | 'qr' | 'connected' | 'disconnected'
  qr?: string
  connectedAt?: Date
}

class WhatsappService {
  private socket?: ReturnType<typeof makeWASocket>
  private state: SessionState = { status: 'idle' }
  private starting = false
  private allowReconnect = true
  private groupSyncTimer?: NodeJS.Timeout
  private syncingGroups = false

  async start() {
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
          logger.info('WhatsApp QR updated. Consulta GET /api/whatsapp/session para recuperar el valor y renderizarlo en el panel.')
        }

        if (connection === 'open') {
          this.state = { status: 'connected', connectedAt: new Date() }
          logger.info('WhatsApp connection established')
          await whatsappIdentityService.repairStoredContacts()
          this.scheduleGroupSync()
          const { outboundMessageService } = await import('./outbound_message.service')
          await outboundMessageService.flushPending()
        }

        if (connection === 'close') {
          this.clearGroupSyncTimer()
          this.socket = undefined
          const disconnectedByLogout = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode === DisconnectReason.loggedOut
          const shouldReconnect = this.allowReconnect && !disconnectedByLogout
          this.state = { status: 'disconnected' }
          logger.warn(`WhatsApp connection closed. reconnect=${shouldReconnect}`)

          if (shouldReconnect) {
            await this.start()
          }
        }
      })

      this.socket.ev.on('messages.upsert', async (event) => {
        if (event.type !== 'notify' && event.type !== 'append') {
          return
        }

        for (const message of event.messages) {
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

  async stop() {
    this.allowReconnect = false
    this.clearGroupSyncTimer()

    if (this.socket) {
      this.socket.end(new Error('Session closed manually'))
      this.socket = undefined
    }

    this.state = { status: 'disconnected' }
    return this.state
  }

  async reset() {
    await this.stop()

    const authDir = this.getAuthDir()
    fs.rmSync(authDir, { recursive: true, force: true })
    fs.mkdirSync(authDir, { recursive: true })

    logger.info('WhatsApp auth state cleared. Starting a new session.')

    return this.start()
  }

  getSessionState() {
    return this.state
  }

  isConnected() {
    return Boolean(this.socket) && this.state.status === 'connected'
  }

  async sendText(jid: string, text: string) {
    await this.sendTextNow(jid, text)
  }

  async sendMedia(jid: string, filePath: string, caption?: string) {
    await this.sendMediaNow(jid, filePath, caption)
  }

  async sendTextNow(jid: string, text: string) {
    if (!this.socket) {
      throw new Error('WhatsApp session is not connected')
    }

    await this.socket.sendMessage(jid, { text })
  }

  async sendMediaNow(jid: string, filePath: string, caption?: string) {
    if (!this.socket) {
      throw new Error('WhatsApp session is not connected')
    }

    await this.socket.sendMessage(jid, {
      image: { url: filePath },
      caption,
    })
  }

  async syncGroups() {
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
      return await groupService.upsertGroups(mapped)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      if (message.toLowerCase().includes('rate-overlimit')) {
        logger.warn(`WhatsApp group sync rate limited. Retrying in ${GROUP_SYNC_RATE_LIMIT_DELAY_MS / 1000}s.`)
        this.scheduleGroupSync(GROUP_SYNC_RATE_LIMIT_DELAY_MS)
        return []
      }

      logger.error(`WhatsApp group sync failed: ${message}`)
      return []
    } finally {
      this.syncingGroups = false
    }
  }

  private scheduleGroupSync(delayMs = GROUP_SYNC_INITIAL_DELAY_MS) {
    this.clearGroupSyncTimer()

    this.groupSyncTimer = setTimeout(() => {
      void this.syncGroups()
    }, delayMs)
  }

  private clearGroupSyncTimer() {
    if (this.groupSyncTimer) {
      clearTimeout(this.groupSyncTimer)
      this.groupSyncTimer = undefined
    }
  }

  private getAuthDir() {
    return path.resolve(process.cwd(), config.SESSION_AUTH_DIR)
  }

  private async handleMessage(message: WAMessage) {
    const remoteJid = message.key.remoteJid
    if (!remoteJid || message.key.fromMe || remoteJid.endsWith('@g.us')) {
      return
    }

    const text = this.extractText(message)
    if (!text) {
      return
    }

    await inboundMessageService.processIncomingText({
      fromJid: remoteJid,
      text,
      externalMessageId: message.key.id || undefined,
      contactName: message.pushName || undefined,
      rawPayload: message as unknown as Record<string, unknown>,
    })
  }

  private extractText(message: WAMessage) {
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
}

export const whatsappService = new WhatsappService()