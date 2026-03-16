import { Request } from 'express'
import { In } from 'typeorm'
import { config } from '@/config'
import { ClientContact } from '@/entities/client_contact.entity'
import { InboundMessage } from '@/entities/inbound_message.entity'
import { OutboundMessage } from '@/entities/outbound_message.entity'
import { NotFound } from '@/middlewares/error_handler'

type ConversationDirection = 'inbound' | 'outbound'
type ConversationMessageStatus = 'sent' | 'pending' | 'failed'

function formatDate(value?: Date) {
  if (!value) {
    return ''
  }

  return new Intl.DateTimeFormat('es-MX', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: config.SCHEDULE_TIME_ZONE,
  }).format(value)
}

function buildApiBaseUrl(req: Request) {
  return `${req.protocol}://${req.get('host')}`
}

function resolveMediaUrl(req: Request, filePath?: string | null) {
  if (!filePath) {
    return undefined
  }

  return `${buildApiBaseUrl(req)}/${filePath.replace(/\\/g, '/').replace(/^\/+/, '')}`
}

function inboundTimestamp(message: InboundMessage) {
  return message.receivedAt || message.createdAt
}

function outboundTimestamp(message: OutboundMessage) {
  return message.sentAt || message.lastAttemptAt || message.createdAt
}

function inboundPreview(message: InboundMessage) {
  const body = message.body?.trim()
  if (body) {
    return body
  }

  return message.messageType === 'image' ? 'Imagen recibida' : 'Mensaje recibido'
}

function outboundPreview(message: OutboundMessage) {
  if (message.messageType === 'IMAGE') {
    return message.caption?.trim() || 'Imagen enviada'
  }

  return message.messageText?.trim() || 'Mensaje enviado'
}

function outboundStatus(message: OutboundMessage): ConversationMessageStatus {
  if (message.status === 'FAILED') {
    return 'failed'
  }

  if (message.status === 'SENT') {
    return 'sent'
  }

  return 'pending'
}

export const panelConversationsService = {
  async list(req: Request, limit?: number) {
    const contacts = await ClientContact.find({ order: { updatedAt: 'DESC' } })

    if (contacts.length === 0) {
      return []
    }

    const contactIds = contacts.map((contact) => contact.id)
    const contactJids = contacts.map((contact) => contact.whatsappJid)

    const [inboundMessages, outboundMessages] = await Promise.all([
      InboundMessage.find({
        where: { contact: { id: In(contactIds) } },
        order: { receivedAt: 'DESC', createdAt: 'DESC' },
      }),
      OutboundMessage.find({
        where: { recipientJid: In(contactJids) },
        order: { sentAt: 'DESC', lastAttemptAt: 'DESC', createdAt: 'DESC' },
      }),
    ])

    const latestInboundByContactId = new Map<string, InboundMessage>()
    for (const message of inboundMessages) {
      if (!latestInboundByContactId.has(message.contact.id)) {
        latestInboundByContactId.set(message.contact.id, message)
      }
    }

    const latestOutboundByJid = new Map<string, OutboundMessage>()
    for (const message of outboundMessages) {
      if (!latestOutboundByJid.has(message.recipientJid)) {
        latestOutboundByJid.set(message.recipientJid, message)
      }
    }

    const conversations = contacts
      .map((contact) => {
        const latestInbound = latestInboundByContactId.get(contact.id)
        const latestOutbound = latestOutboundByJid.get(contact.whatsappJid)
        const latestInboundAt = latestInbound ? inboundTimestamp(latestInbound).getTime() : 0
        const latestOutboundAt = latestOutbound ? outboundTimestamp(latestOutbound).getTime() : 0

        if (!latestInbound && !latestOutbound) {
          return null
        }

        const isOutboundLatest = latestOutboundAt > latestInboundAt
        const latestAt = isOutboundLatest ? outboundTimestamp(latestOutbound as OutboundMessage) : inboundTimestamp(latestInbound as InboundMessage)

        return {
          contactId: contact.id,
          contactName: contact.contactName || contact.phoneNumber,
          phoneNumber: contact.phoneNumber,
          whatsappJid: contact.whatsappJid,
          lastMessageAt: formatDate(latestAt),
          lastMessagePreview: isOutboundLatest
            ? outboundPreview(latestOutbound as OutboundMessage)
            : inboundPreview(latestInbound as InboundMessage),
          lastDirection: isOutboundLatest ? 'outbound' as ConversationDirection : 'inbound' as ConversationDirection,
          flowStatus: contact.currentFlow,
          orderAt: latestAt.getTime(),
        }
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((a, b) => b.orderAt - a.orderAt)
      .map(({ orderAt, ...item }) => item)

    return typeof limit === 'number' ? conversations.slice(0, limit) : conversations
  },

  async getByContactId(req: Request, contactId: string) {
    const contact = await ClientContact.findOne({ where: { id: contactId } })
    if (!contact) {
      throw NotFound('Conversación no encontrada.')
    }

    const [inboundMessages, outboundMessages] = await Promise.all([
      InboundMessage.find({
        where: { contact: { id: contact.id } },
        order: { receivedAt: 'ASC', createdAt: 'ASC' },
      }),
      OutboundMessage.find({
        where: { recipientJid: contact.whatsappJid },
        order: { sentAt: 'ASC', lastAttemptAt: 'ASC', createdAt: 'ASC' },
      }),
    ])

    const messages = [
      ...inboundMessages.map((message) => ({
        id: `inbound-${message.id}`,
        direction: 'inbound' as const,
        type: message.messageType === 'image' ? 'image' as const : 'text' as const,
        text: inboundPreview(message),
        timestamp: formatDate(inboundTimestamp(message)),
        timestampIso: inboundTimestamp(message).toISOString(),
        mediaUrl: undefined,
        status: 'sent' as const,
        sourceType: 'CONTACT' as const,
        orderAt: inboundTimestamp(message).getTime(),
      })),
      ...outboundMessages.map((message) => ({
        id: `outbound-${message.id}`,
        direction: 'outbound' as const,
        type: message.messageType === 'IMAGE' ? 'image' as const : 'text' as const,
        text: outboundPreview(message),
        timestamp: formatDate(outboundTimestamp(message)),
        timestampIso: outboundTimestamp(message).toISOString(),
        mediaUrl: message.messageType === 'IMAGE' ? resolveMediaUrl(req, message.mediaFilePath) : undefined,
        status: outboundStatus(message),
        sourceType: message.sourceType,
        orderAt: outboundTimestamp(message).getTime(),
      })),
    ]
      .sort((a, b) => a.orderAt - b.orderAt)
      .map(({ orderAt, ...message }) => message)

    return {
      contact: {
        id: contact.id,
        contactName: contact.contactName || contact.phoneNumber,
        phoneNumber: contact.phoneNumber,
        whatsappJid: contact.whatsappJid,
        flowStatus: contact.currentFlow,
        lastInboundAt: formatDate(contact.lastInboundAt),
      },
      messages,
    }
  },
}