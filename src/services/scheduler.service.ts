import cron from 'node-cron'
import path from 'path'
import { config } from '@/config'
import { NotificationDispatch } from '@/entities/notification_dispatch.entity'
import { NotificationSchedule } from '@/entities/notification_schedule.entity'
import { groupService } from './group.service'
import { autoMessageService } from './auto_message.service'
import { outboundMessageService } from './outbound_message.service'
import { getTimeParts } from '@/utils/time'
import { sleep } from '@/utils/sleep'
import logger from '@/utils/logger'
import { whatsappSessionManager } from './whatsapp_session_manager.service'

async function resolveMessageForGroup(clientId: string, schedule: NotificationSchedule, groupIndex: number) {
  const templateIds = schedule.messageTemplateIds ?? []

  if (templateIds.length > 0) {
    const messageId = templateIds[groupIndex % templateIds.length]
    const message = await autoMessageService.findById(clientId, messageId).catch(() => null)
    if (message) {
      return {
        messageText: message.content || undefined,
        mediaFilePath: message.image?.filePath ? path.resolve(config.PROJECT_ROOT, message.image.filePath) : undefined,
        mediaAssetPath: message.image?.filePath,
      }
    }
    logger.warn(`Schedule ${schedule.id}: could not resolve message template ${messageId} for group at index ${groupIndex}`)
  }

  return {
    messageText: schedule.messageText,
    mediaFilePath: schedule.mediaAsset?.filePath ? path.resolve(config.PROJECT_ROOT, schedule.mediaAsset.filePath) : undefined,
    mediaAssetPath: schedule.mediaAsset?.filePath,
  }
}

async function dispatchSchedule(schedule: NotificationSchedule, sessionId: string, executionKey: string) {
  const clientId = schedule.clientId
  const activeGroupJids = Array.from(new Set(await groupService.resolveGroupJids(sessionId, schedule.groupJids, { activeOnly: true })))

  if (activeGroupJids.length !== schedule.groupJids.length) {
    schedule.groupJids = activeGroupJids
  }

  if (activeGroupJids.length === 0) {
    schedule.isActive = false
    schedule.lastExecutionKey = undefined
    await schedule.save()
    logger.warn(`Schedule ${schedule.id} was deactivated because all destination groups are inactive.`)
    return
  }

  for (let i = activeGroupJids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [activeGroupJids[i], activeGroupJids[j]] = [activeGroupJids[j]!, activeGroupJids[i]!]
  }

  for (let i = 0; i < activeGroupJids.length; i++) {
    const groupJid = activeGroupJids[i]
    const { messageText, mediaFilePath, mediaAssetPath } = await resolveMessageForGroup(clientId, schedule, i)

    const dispatch = await NotificationDispatch.save({
      clientId,
      schedule,
      groupJid,
      groupName: (await groupService.resolveGroupName(sessionId, groupJid)) || undefined,
      status: 'PENDING',
      attempts: 0,
      executedAt: new Date(),
      messageText,
      mediaAssetPath,
      errorMessage: undefined,
    })

    if (mediaFilePath) {
      await outboundMessageService.queueMedia({
        sessionId,
        recipientJid: groupJid,
        filePath: mediaFilePath,
        caption: messageText,
        sourceType: 'SCHEDULE',
        sourceId: schedule.id,
        maxAttempts: schedule.retryLimit,
        retryDelayMs: schedule.throttleMs,
        metadata: { dispatchId: dispatch.id },
      })
    } else if (messageText) {
      await outboundMessageService.queueText({
        sessionId,
        recipientJid: groupJid,
        text: messageText,
        sourceType: 'SCHEDULE',
        sourceId: schedule.id,
        maxAttempts: schedule.retryLimit,
        retryDelayMs: schedule.throttleMs,
        metadata: { dispatchId: dispatch.id },
      })
    } else {
      logger.warn(`Schedule ${schedule.id} has no message content for group ${groupJid}`)
    }

    await sleep(schedule.throttleMs)
  }

  schedule.lastExecutionKey = executionKey
  await schedule.save()
}

export const schedulerService = {
  start() {
    cron.schedule(
      '*/1 * * * *',
      async () => {
        const now = getTimeParts(config.SCHEDULE_TIME_ZONE)
        const executionKey = `${now.dateKey}-${now.minuteKey}`

        // Get all connected sessions
        const connectedSessions = whatsappSessionManager
          .getAllSessionStates()
          .filter(({ state }) => state.status === 'connected')

        for (const { sessionId, clientId } of connectedSessions) {
          const schedules = await NotificationSchedule.find({ where: { isActive: true, clientId } })

          for (const schedule of schedules) {
            const matchesDay = schedule.daysOfWeek.includes(now.weekday)
            const matchesTime = schedule.times.includes(now.minuteKey)
            const alreadyExecuted = schedule.lastExecutionKey === executionKey

            if (!matchesDay || !matchesTime || alreadyExecuted) {
              continue
            }

            await dispatchSchedule(schedule, sessionId, executionKey)
          }
        }
      },
      { timezone: config.SCHEDULE_TIME_ZONE }
    )

    logger.info(`Scheduler started with timezone ${config.SCHEDULE_TIME_ZONE}`)
  },
}
