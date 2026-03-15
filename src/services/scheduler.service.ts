import cron from 'node-cron'
import path from 'path'
import { config } from '@/config'
import { NotificationDispatch } from '@/entities/notification_dispatch.entity'
import { NotificationSchedule } from '@/entities/notification_schedule.entity'
import { groupService } from './group.service'
import { whatsappService } from './whatsapp.service'
import { getTimeParts } from '@/utils/time'
import { sleep } from '@/utils/sleep'
import logger from '@/utils/logger'

async function dispatchSchedule(schedule: NotificationSchedule, executionKey: string) {
  for (const groupJid of schedule.groupJids) {
    let attempts = 0
    let sent = false
    let lastError = ''

    while (attempts < schedule.retryLimit && !sent) {
      attempts += 1
      try {
        if (schedule.mediaAsset?.filePath) {
          await whatsappService.sendMedia(groupJid, path.resolve(process.cwd(), schedule.mediaAsset.filePath), schedule.messageText)
        } else if (schedule.messageText) {
          await whatsappService.sendText(groupJid, schedule.messageText)
        }

        sent = true
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error)
        logger.error(`Scheduled dispatch failed for ${groupJid} on attempt ${attempts}: ${lastError}`)
        if (attempts < schedule.retryLimit) {
          await sleep(schedule.throttleMs)
        }
      }
    }

    await NotificationDispatch.save({
      schedule,
      groupJid,
      groupName: (await groupService.resolveGroupName(groupJid)) || undefined,
      status: sent ? 'SENT' : 'FAILED',
      attempts,
      executedAt: new Date(),
      messageText: schedule.messageText,
      mediaAssetPath: schedule.mediaAsset?.filePath,
      errorMessage: sent ? undefined : lastError,
    })

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