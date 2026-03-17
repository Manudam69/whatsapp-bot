import { config } from '@/config'
import { NotificationDispatch } from '@/entities/notification_dispatch.entity'
import { OutboundMessage, OutboundMessageSource } from '@/entities/outbound_message.entity'
import { reportService } from './report.service'
import { sleep } from '@/utils/sleep'
import logger from '@/utils/logger'
import { whatsappService } from './whatsapp.service'
import { antibanService } from './antiban.service'
import { sessionOwnerService } from './session_owner.service'

type BaseQueueInput = {
  ownerPhoneNumber?: string
  recipientJid: string
  sourceType: OutboundMessageSource
  sourceId?: string
  maxAttempts?: number
  retryDelayMs?: number
  metadata?: Record<string, unknown>
}

type QueueTextInput = BaseQueueInput & {
  text: string
}

type QueueMediaInput = BaseQueueInput & {
  filePath: string
  caption?: string
}

function isDisconnectedError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return message.toLowerCase().includes('not connected')
}

function normalizeAttempts(value?: number) {
  return Math.max(1, value ?? config.MAX_SEND_RETRIES)
}

function normalizeDelay(value?: number) {
  return Math.max(0, value ?? config.MESSAGE_THROTTLE_MS)
}

class OutboundMessageService {
  private flushPromise?: Promise<void>

  private resolveOwnerPhoneNumber(ownerPhoneNumber?: string) {
    return ownerPhoneNumber || sessionOwnerService.requireActiveOwnerPhoneNumber()
  }

  async queueText(input: QueueTextInput) {
    const ownerPhoneNumber = this.resolveOwnerPhoneNumber(input.ownerPhoneNumber)
    const message = OutboundMessage.create({
      ownerPhoneNumber,
      recipientJid: input.recipientJid,
      messageType: 'TEXT',
      messageText: input.text,
      status: 'PENDING',
      maxAttempts: normalizeAttempts(input.maxAttempts),
      retryDelayMs: normalizeDelay(input.retryDelayMs),
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      metadata: input.metadata,
    })

    await message.save()
    await this.flushPending()
    return message
  }

  async queueMedia(input: QueueMediaInput) {
    const ownerPhoneNumber = this.resolveOwnerPhoneNumber(input.ownerPhoneNumber)
    const message = OutboundMessage.create({
      ownerPhoneNumber,
      recipientJid: input.recipientJid,
      messageType: 'IMAGE',
      mediaFilePath: input.filePath,
      caption: input.caption,
      status: 'PENDING',
      maxAttempts: normalizeAttempts(input.maxAttempts),
      retryDelayMs: normalizeDelay(input.retryDelayMs),
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      metadata: input.metadata,
    })

    await message.save()
    await this.flushPending()
    return message
  }

  async flushPending() {
    if (this.flushPromise) {
      return this.flushPromise
    }

    this.flushPromise = this.runFlush().finally(() => {
      this.flushPromise = undefined
    })

    return this.flushPromise
  }

  private async runFlush() {
    const ownerPhoneNumber = sessionOwnerService.getActiveOwnerPhoneNumber()
    if (!whatsappService.isConnected() || !ownerPhoneNumber) {
      return
    }

    const pending = await OutboundMessage.find({
      where: { status: 'PENDING', ownerPhoneNumber },
      order: { createdAt: 'ASC' },
    })

    for (const message of pending) {
      if (!whatsappService.isConnected()) {
        return
      }

      await this.deliver(message)
    }
  }

  private async deliver(message: OutboundMessage) {
    const isScheduled = message.sourceType === 'SCHEDULE'

    while (message.attempts < message.maxAttempts) {
      if (!whatsappService.isConnected()) {
        message.errorMessage = 'WhatsApp session is not connected'
        await message.save()
        return
      }

      const content = message.messageText || message.caption || 'media'

      // Antiban rate limiting applies only to scheduled notifications.
      // Bot replies (FLOW_REPLY, REPORT_FORWARD, REPORT_STATUS_UPDATE) bypass it.
      if (isScheduled) {
        const decision = await antibanService.beforeSend(message.recipientJid, content)
        if (!decision.allowed) {
          // Scheduled messages are time-sensitive — mark as FAILED instead of
          // leaving as PENDING, since delivering them the next day is incorrect.
          message.status = 'FAILED'
          message.errorMessage = decision.reason ?? 'antiban: límite diario alcanzado'
          await message.save()
          await this.afterFailure(message)
          logger.warn(`[antiban] Notificación programada ${message.id} expirada: ${decision.reason}`)
          return
        }

        // Human-like delay recommended by antiban
        if (decision.delayMs > 0) {
          await sleep(decision.delayMs)
        }
      }

      // Human-like delay for bot flow replies: show typing indicator + 2–5s wait.
      // This avoids the "instant bot" pattern that WhatsApp detects.
      if (message.sourceType === 'FLOW_REPLY') {
        const humanDelay = 2000 + Math.floor(Math.random() * 3000) // 2–5s
        await whatsappService.sendTyping(message.recipientJid)
        await sleep(humanDelay)
      }

      message.attempts += 1
      message.lastAttemptAt = new Date()
      message.errorMessage = undefined
      await message.save()

      try {
        if (message.messageType === 'IMAGE') {
          await whatsappService.sendMediaNow(message.recipientJid, message.mediaFilePath || '', message.caption)
        } else {
          await whatsappService.sendTextNow(message.recipientJid, message.messageText || '')
        }

        if (isScheduled) antibanService.afterSend(message.recipientJid, content)

        message.status = 'SENT'
        message.sentAt = new Date()
        message.errorMessage = undefined
        await message.save()
        await this.afterDelivery(message)
        return
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        if (isScheduled) antibanService.afterSendFailed(errorMessage)
        message.errorMessage = errorMessage
        await message.save()

        if (isDisconnectedError(error)) {
          return
        }

        if (message.attempts >= message.maxAttempts) {
          message.status = 'FAILED'
          await message.save()
          await this.afterFailure(message)
          return
        }

        logger.warn(`Outbound message ${message.id} failed on attempt ${message.attempts}: ${errorMessage}. Retrying...`)
        await sleep(message.retryDelayMs)
      }
    }
  }

  private async afterDelivery(message: OutboundMessage) {
    if (message.sourceType === 'REPORT_FORWARD' && message.sourceId) {
      const report = await reportService.findById(message.ownerPhoneNumber, message.sourceId)
      const groupJid = typeof message.metadata?.groupJid === 'string' ? message.metadata.groupJid : undefined

      if (report && groupJid) {
        await reportService.markForwarded(report, groupJid)
      }
    }

    if (message.sourceType === 'SCHEDULE') {
      await this.syncDispatchStatus(message, 'SENT')
    }
  }

  private async afterFailure(message: OutboundMessage) {
    if (message.sourceType === 'REPORT_FORWARD' && message.sourceId) {
      const report = await reportService.findById(message.ownerPhoneNumber, message.sourceId)
      const groupJid = typeof message.metadata?.groupJid === 'string' ? message.metadata.groupJid : undefined

      if (report) {
        await reportService.markFailed(report, groupJid)
      }
    }

    if (message.sourceType === 'SCHEDULE') {
      await this.syncDispatchStatus(message, 'FAILED')
    }
  }

  private async syncDispatchStatus(message: OutboundMessage, status: 'SENT' | 'FAILED') {
    const dispatchId = typeof message.metadata?.dispatchId === 'string' ? message.metadata.dispatchId : undefined
    if (!dispatchId) {
      return
    }

    const dispatch = await NotificationDispatch.findOne({ where: { id: dispatchId } })
    if (!dispatch) {
      return
    }

    dispatch.status = status
    dispatch.attempts = message.attempts
    dispatch.executedAt = message.sentAt || message.lastAttemptAt || new Date()
    dispatch.errorMessage = status === 'FAILED' ? message.errorMessage : undefined
    await dispatch.save()
  }
}

export const outboundMessageService = new OutboundMessageService()