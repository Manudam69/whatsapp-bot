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

type SessionState = {
  status: 'idle' | 'connecting' | 'qr' | 'connected' | 'disconnected'
  qr?: string
  connectedAt?: Date
}

class WhatsappService {
  private socket?: ReturnType<typeof makeWASocket>
  private state: SessionState = { status: 'idle' }
  private starting = false

  async start() {
    if (this.starting || this.socket) {
      return this.state
    }

    this.starting = true
    this.state = { status: 'connecting' }

    const authDir = path.resolve(process.cwd(), config.SESSION_AUTH_DIR)
    fs.mkdirSync(authDir, { recursive: true })

    const { state, saveCreds } = await useMultiFileAuthState(authDir)
    const { version } = await fetchLatestBaileysVersion()

    this.socket = makeWASocket({
      version,
      auth: state,
      syncFullHistory: false,
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
        await this.syncGroups()
      }

      if (connection === 'close') {
        this.socket = undefined
        const shouldReconnect = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode !== DisconnectReason.loggedOut
        this.state = { status: 'disconnected' }
        logger.warn(`WhatsApp connection closed. reconnect=${shouldReconnect}`)

        if (shouldReconnect) {
          await this.start()
        }
      }
    })

    this.socket.ev.on('messages.upsert', async (event) => {
      if (event.type !== 'notify') {
        return
      }

      for (const message of event.messages) {
        await this.handleMessage(message)
      }
    })

    this.starting = false
    return this.state
  }

  async stop() {
    if (this.socket) {
      this.socket.end(new Error('Session closed manually'))
      this.socket = undefined
    }
    this.state = { status: 'disconnected' }
    return this.state
  }

  getSessionState() {
    return this.state
  }

  async sendText(jid: string, text: string) {
    if (!this.socket) {
      throw new Error('WhatsApp session is not connected')
    }

    await this.socket.sendMessage(jid, { text })
  }

  async sendMedia(jid: string, filePath: string, caption?: string) {
    if (!this.socket) {
      throw new Error('WhatsApp session is not connected')
    }

    await this.socket.sendMessage(jid, {
      image: { url: filePath },
      caption,
    })
  }

  async syncGroups() {
    if (!this.socket) {
      return []
    }

    const groups = await this.socket.groupFetchAllParticipating()
    const mapped = Object.values(groups).map((group) => ({
      jid: group.id,
      name: group.subject,
      participantCount: group.participants.length,
    }))
    return groupService.upsertGroups(mapped)
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