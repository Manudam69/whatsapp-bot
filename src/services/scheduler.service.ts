import cron from 'node-cron'
import path from 'path'
import { config } from '@/config'
import { NotificationDispatch } from '@/entities/notification_dispatch.entity'
import { NotificationSchedule } from '@/entities/notification_schedule.entity'
import { groupService } from './group.service'
import { outboundMessageService } from './outbound_message.service'
import { getTimeParts } from '@/utils/time'
import { sleep } from '@/utils/sleep'
import logger from '@/utils/logger'

async function dispatchSchedule(schedule: NotificationSchedule, executionKey: string) {
  for (const groupJid of schedule.groupJids) {
    const dispatch = await NotificationDispatch.save({
      schedule,
      groupJid,
      groupName: (await groupService.resolveGroupName(groupJid)) || undefined,
      status: 'PENDING',
      attempts: 0,
      executedAt: new Date(),
      messageText: schedule.messageText,
      mediaAssetPath: schedule.mediaAsset?.filePath,
      errorMessage: undefined,
    })

    if (schedule.mediaAsset?.filePath) {
      await outboundMessageService.queueMedia({
        recipientJid: groupJid,
        filePath: path.resolve(config.PROJECT_ROOT, schedule.mediaAsset.filePath),
        caption: schedule.messageText,
        sourceType: 'SCHEDULE',
        sourceId: schedule.id,
        maxAttempts: schedule.retryLimit,
        retryDelayMs: schedule.throttleMs,
        metadata: { dispatchId: dispatch.id },
      })
    } else if (schedule.messageText) {
      await outboundMessageService.queueText({
        recipientJid: groupJid,
        text: schedule.messageText,
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
        const schedules = await NotificationSchedule.find({ where: { isActive: true } })

        for (const schedule of schedules) {
          const matchesDay = schedule.daysOfWeek.includes(now.weekday)
          const matchesTime = schedule.times.includes(now.minuteKey)
          const alreadyExecuted = schedule.lastExecutionKey === executionKey

          if (!matchesDay || !matchesTime || alreadyExecuted) {
            continue
          }

          await dispatchSchedule(schedule, executionKey)
        }
      },
      { timezone: config.SCHEDULE_TIME_ZONE }
    )

    logger.info(`Scheduler started with timezone ${config.SCHEDULE_TIME_ZONE}`)
  },
}