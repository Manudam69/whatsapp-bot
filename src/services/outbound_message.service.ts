import { In } from 'typeorm'
import { config } from '@/config'
import { NotificationDispatch } from '@/entities/notification_dispatch.entity'
import { OutboundMessage, OutboundMessageSource } from '@/entities/outbound_message.entity'
import { BotConfiguration } from '@/entities/bot_configuration.entity'
import { reportService } from './report.service'
import { sseService } from './sse.service'
import { sleep } from '@/utils/sleep'
import logger from '@/utils/logger'
import { antibanService } from './antiban.service'

type BaseQueueInput = {
  sessionId: string
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

// Sources that are time-sensitive user replies — processed in the reply queue,
// independently of the scheduled-message queue, so bot conversations are never
// blocked by antiban delays from a mass send.
const REPLY_SOURCES: OutboundMessageSource[] = ['FLOW_REPLY', 'REPORT_FORWARD', 'REPORT_STATUS_UPDATE']
const SCHEDULE_SOURCES: OutboundMessageSource[] = ['SCHEDULE']

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

async function getSessionInstance(sessionId: string) {
  const { whatsappSessionManager } = await import('./whatsapp_session_manager.service')
  return whatsappSessionManager.getSession(sessionId)
}

class OutboundMessageService {
  // Two independent flush locks per session so scheduled sends and bot replies never block each other.
  private scheduleFlushPromises = new Map<string, Promise<void>>()
  private replyFlushPromises = new Map<string, Promise<void>>()

  async queueText(input: QueueTextInput) {
    const message = OutboundMessage.create({
      sessionId: input.sessionId,
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
    await this.flushForSource(input.sessionId, input.sourceType)
    return message
  }

  async queueMedia(input: QueueMediaInput) {
    const message = OutboundMessage.create({
      sessionId: input.sessionId,
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
    await this.flushForSource(input.sessionId, input.sourceType)
    return message
  }

  // Called on WhatsApp reconnect to drain any messages that accumulated while offline.
  async flushPending(sessionId: string) {
    await Promise.all([this.flushScheduled(sessionId), this.flushReplies(sessionId)])
  }

  private flushForSource(sessionId: string, sourceType: OutboundMessageSource) {
    return REPLY_SOURCES.includes(sourceType) ? this.flushReplies(sessionId) : this.flushScheduled(sessionId)
  }

  private flushScheduled(sessionId: string) {
    if (this.scheduleFlushPromises.has(sessionId)) {
      return this.scheduleFlushPromises.get(sessionId)!
    }
    const promise = this.runFlush(sessionId, SCHEDULE_SOURCES).finally(() => {
      this.scheduleFlushPromises.delete(sessionId)
    })
    this.scheduleFlushPromises.set(sessionId, promise)
    return promise
  }

  private flushReplies(sessionId: string) {
    if (this.replyFlushPromises.has(sessionId)) {
      return this.replyFlushPromises.get(sessionId)!
    }
    const promise = this.runFlush(sessionId, REPLY_SOURCES).finally(() => {
      this.replyFlushPromises.delete(sessionId)
    })
    this.replyFlushPromises.set(sessionId, promise)
    return promise
  }

  private async runFlush(sessionId: string, sourceTypes: OutboundMessageSource[]) {
    const session = await getSessionInstance(sessionId)
    if (!session?.isConnected()) {
      return
    }

    const pending = await OutboundMessage.find({
      where: { status: 'PENDING', sessionId, sourceType: In(sourceTypes) },
      order: { createdAt: 'ASC' },
    })

    let someRateLimited = false
    for (const message of pending) {
      const currentSession = await getSessionInstance(sessionId)
      if (!currentSession?.isConnected()) {
        return
      }

      const rateLimited = await this.deliver(message)
      if (rateLimited) someRateLimited = true
    }

    // One or more scheduled messages hit the per-minute antiban limit and were
    // left PENDING. Schedule a retry flush right after the current minute window
    // resets so they get processed at the end of the queue without being lost.
    if (someRateLimited && SCHEDULE_SOURCES.some((s) => sourceTypes.includes(s))) {
      const msUntilNextMinute = (60 - new Date().getSeconds() + 2) * 1000
      logger.info(`[antiban] Scheduled messages hit per-minute limit; retrying in ${Math.round(msUntilNextMinute / 1000)}s`)
      setTimeout(() => { void this.flushScheduled(sessionId) }, msUntilNextMinute)
    }
  }

  // Returns true when the message hit the per-minute antiban limit and was left
  // PENDING so the caller can schedule a retry after the window resets.
  private async deliver(message: OutboundMessage): Promise<boolean> {
    const isScheduled = message.sourceType === 'SCHEDULE'
    const session = await getSessionInstance(message.sessionId)

    while (message.attempts < message.maxAttempts) {
      const currentSession = await getSessionInstance(message.sessionId)
      if (!currentSession?.isConnected()) {
        message.errorMessage = 'WhatsApp session is not connected'
        await message.save()
        return false
      }

      const content = message.messageText || message.caption || 'media'

      // Antiban rate limiting applies only to scheduled notifications.
      if (isScheduled) {
        // Find client via session to get bot config
        const { AppDataSource } = await import('@/database/datasource')
        const sessionRow = await AppDataSource.query<Array<{ client_id: string }>>(
          `SELECT "client_id" FROM "whatsapp_sessions" WHERE "id" = $1`,
          [message.sessionId],
        )
        const clientId = sessionRow[0]?.client_id
        const botConfig = clientId ? await BotConfiguration.findOne({ where: { clientId } }) : null
        const skipIdenticalCheck = botConfig?.skipIdenticalMessageCheck ?? false
        const decision = await antibanService.beforeSend(message.recipientJid, content, { skipIdenticalCheck })
        if (!decision.allowed) {
          // Per-minute rate limit: leave the message PENDING so it gets picked
          // up by the next flush after the current minute window resets.
          if (decision.reason?.includes('per-minute limit')) {
            const dispatchId = typeof message.metadata?.dispatchId === 'string' ? message.metadata.dispatchId : undefined
            if (dispatchId) {
              await AppDataSource.getRepository(NotificationDispatch).increment({ id: dispatchId }, 'rateLimitedCount', 1)
            }
            logger.info(`[antiban] Message ${message.id} hit per-minute limit; will retry after window resets`)
            return true
          }

          // All other antiban blocks (daily, hourly, paused, warm-up) → permanent failure.
          message.status = 'FAILED'
          message.errorMessage = decision.reason ?? 'antiban: límite diario alcanzado'
          await message.save()
          await this.afterFailure(message)
          logger.warn(`[antiban] Notificación programada ${message.id} expirada: ${decision.reason}`)
          return false
        }

        if (decision.delayMs > 0) {
          await sleep(decision.delayMs)
        }
      }

      if (message.sourceType === 'FLOW_REPLY') {
        const humanDelay = 2000 + Math.floor(Math.random() * 3000)
        await session?.sendTyping(message.recipientJid)
        await sleep(humanDelay)
      }

      message.attempts += 1
      message.lastAttemptAt = new Date()
      message.errorMessage = undefined
      await message.save()

      try {
        const activeSession = await getSessionInstance(message.sessionId)
        let waMessageId: string | undefined
        if (message.messageType === 'IMAGE') {
          waMessageId = await activeSession?.sendMediaNow(message.recipientJid, message.mediaFilePath || '', message.caption)
        } else {
          waMessageId = await activeSession?.sendTextNow(message.recipientJid, message.messageText || '')
        }

        if (isScheduled) antibanService.afterSend(message.recipientJid, content)

        message.status = 'SENT'
        message.sentAt = new Date()
        message.errorMessage = undefined
        if (waMessageId) {
          message.metadata = { ...message.metadata, whatsappMessageId: waMessageId }
        }
        await message.save()
        await this.afterDelivery(message)
        return false
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        if (isScheduled) antibanService.afterSendFailed(errorMessage)
        message.errorMessage = errorMessage
        await message.save()

        if (isDisconnectedError(error)) {
          return false
        }

        if (message.attempts >= message.maxAttempts) {
          message.status = 'FAILED'
          await message.save()
          await this.afterFailure(message)
          return false
        }

        logger.warn(`Outbound message ${message.id} failed on attempt ${message.attempts}: ${errorMessage}. Retrying...`)
        await sleep(message.retryDelayMs)
      }
    }
    return false
  }

  private async afterDelivery(message: OutboundMessage) {
    if (message.sourceType === 'REPORT_FORWARD' && message.sourceId) {
      const { AppDataSource } = await import('@/database/datasource')
      const sessionRow = await AppDataSource.query<Array<{ client_id: string }>>(
        `SELECT "client_id" FROM "whatsapp_sessions" WHERE "id" = $1`,
        [message.sessionId],
      )
      const clientId = sessionRow[0]?.client_id
      if (clientId) {
        const report = await reportService.findById(clientId, message.sourceId)
        const groupJid = typeof message.metadata?.groupJid === 'string' ? message.metadata.groupJid : undefined

        if (report && groupJid) {
          await reportService.markForwarded(report, groupJid)
        }
      }
    }

    if (message.sourceType === 'SCHEDULE') {
      await this.syncDispatchStatus(message, 'SENT')
    }
  }

  private async afterFailure(message: OutboundMessage) {
    if (message.sourceType === 'REPORT_FORWARD' && message.sourceId) {
      const { AppDataSource } = await import('@/database/datasource')
      const sessionRow = await AppDataSource.query<Array<{ client_id: string }>>(
        `SELECT "client_id" FROM "whatsapp_sessions" WHERE "id" = $1`,
        [message.sessionId],
      )
      const clientId = sessionRow[0]?.client_id
      if (clientId) {
        const report = await reportService.findById(clientId, message.sourceId)
        const groupJid = typeof message.metadata?.groupJid === 'string' ? message.metadata.groupJid : undefined

        if (report) {
          await reportService.markFailed(report, groupJid)
        }
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

    sseService.emit(dispatch.clientId, 'dashboard:refresh')
  }
}

export const outboundMessageService = new OutboundMessageService()
