import { Request } from 'express'
import { In } from 'typeorm'
import { config } from '@/config'
import { ClientContact } from '@/entities/client_contact.entity'
import { InboundMessage } from '@/entities/inbound_message.entity'
import { OutboundMessage } from '@/entities/outbound_message.entity'
import { NotFound } from '@/middlewares/error_handler'
import { inboundMessageService } from './inbound_message.service'

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
  async list(req: Request, clientId: string, limit?: number) {
    const contacts = await ClientContact.find({ where: { clientId }, order: { updatedAt: 'DESC' } })

    if (contacts.length === 0) {
      return []
    }

    const contactIds = contacts.map((contact) => contact.id)
    const contactJids = contacts.map((contact) => contact.whatsappJid)
    const sessionIds = [...new Set(contacts.map((contact) => contact.sessionId))]

    const [inboundMessages, outboundMessages] = await Promise.all([
      InboundMessage.find({
        where: { contact: { id: In(contactIds) } },
        order: { receivedAt: 'DESC', createdAt: 'DESC' },
      }),
      OutboundMessage.find({
        where: { sessionId: In(sessionIds), recipientJid: In(contactJids) },
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
          sessionId: contact.sessionId,
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

  async getByContactId(req: Request, clientId: string, contactId: string) {
    const contact = await ClientContact.findOne({ where: { id: contactId, clientId } })
    if (!contact) {
      throw NotFound('Conversación no encontrada.')
    }

    const [inboundMessages, outboundMessages] = await Promise.all([
      InboundMessage.find({
        where: { contact: { id: contact.id } },
        order: { receivedAt: 'ASC', createdAt: 'ASC' },
      }),
      OutboundMessage.find({
        where: { sessionId: contact.sessionId, recipientJid: contact.whatsappJid },
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
        sessionId: contact.sessionId,
        flowStatus: contact.currentFlow,
        lastInboundAt: formatDate(contact.lastInboundAt),
      },
      messages,
    }
  },

  async recoverPending(clientId: string) {
    const contacts = await ClientContact.find({ where: { clientId }, order: { updatedAt: 'ASC' } })
    if (contacts.length === 0) {
      return { scannedContacts: 0, recoveredContacts: 0, replayedMessages: 0, skippedContacts: 0, recovered: [] as Array<{ contactId: string; contactName: string; replayedMessages: number; flowStatus: string }> }
    }

    const contactIds = contacts.map((contact) => contact.id)
    const contactJids = contacts.map((contact) => contact.whatsappJid)
    const sessionIds = [...new Set(contacts.map((contact) => contact.sessionId))]

    const [inboundMessages, outboundMessages] = await Promise.all([
      InboundMessage.find({
        where: { contact: { id: In(contactIds) } },
        order: { receivedAt: 'ASC', createdAt: 'ASC' },
      }),
      OutboundMessage.find({
        where: { sessionId: In(sessionIds), recipientJid: In(contactJids) },
        order: { sentAt: 'ASC', lastAttemptAt: 'ASC', createdAt: 'ASC' },
      }),
    ])

    const inboundByContactId = new Map<string, InboundMessage[]>()
    for (const message of inboundMessages) {
      const list = inboundByContactId.get(message.contact.id) || []
      list.push(message)
      inboundByContactId.set(message.contact.id, list)
    }

    const outboundByConversationKey = new Map<string, OutboundMessage[]>()
    for (const message of outboundMessages) {
      const key = `${message.sessionId}:${message.recipientJid}`
      const list = outboundByConversationKey.get(key) || []
      list.push(message)
      outboundByConversationKey.set(key, list)
    }

    const recovered: Array<{ contactId: string; contactName: string; replayedMessages: number; flowStatus: string }> = []
    let replayedMessages = 0
    let skippedContacts = 0

    for (const contact of contacts) {
      const inboundForContact = inboundByContactId.get(contact.id) || []
      if (inboundForContact.length === 0) {
        skippedContacts += 1
        continue
      }

      const outboundForContact = outboundByConversationKey.get(`${contact.sessionId}:${contact.whatsappJid}`) || []
      const latestOutbound = outboundForContact[outboundForContact.length - 1]
      const latestOutboundAt = latestOutbound ? outboundTimestamp(latestOutbound).getTime() : 0
      const pendingInbound = inboundForContact.filter((message) => message.messageType === 'text' && inboundTimestamp(message).getTime() > latestOutboundAt)

      if (pendingInbound.length === 0) {
        skippedContacts += 1
        continue
      }

      for (const message of pendingInbound) {
        await inboundMessageService.replayStoredMessage(message)
      }

      replayedMessages += pendingInbound.length
      recovered.push({
        contactId: contact.id,
        contactName: contact.contactName || contact.phoneNumber,
        replayedMessages: pendingInbound.length,
        flowStatus: contact.currentFlow,
      })
    }

    return {
      scannedContacts: contacts.length,
      recoveredContacts: recovered.length,
      replayedMessages,
      skippedContacts,
      recovered,
    }
  },
}
