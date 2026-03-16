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
import { sessionOwnerService } from './session_owner.service'

async function dispatchSchedule(schedule: NotificationSchedule, executionKey: string) {
  const ownerPhoneNumber = schedule.ownerPhoneNumber
  const activeGroupJids = Array.from(new Set(await groupService.resolveGroupJids(ownerPhoneNumber, schedule.groupJids, { activeOnly: true })))

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

  for (const groupJid of activeGroupJids) {
    const dispatch = await NotificationDispatch.save({
      ownerPhoneNumber,
      schedule,
      groupJid,
      groupName: (await groupService.resolveGroupName(ownerPhoneNumber, groupJid)) || undefined,
      status: 'PENDING',
      attempts: 0,
      executedAt: new Date(),
      messageText: schedule.messageText,
      mediaAssetPath: schedule.mediaAsset?.filePath,
      errorMessage: undefined,
    })

    if (schedule.mediaAsset?.filePath) {
      await outboundMessageService.queueMedia({
        ownerPhoneNumber,
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
        ownerPhoneNumber,
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
        const ownerPhoneNumber = sessionOwnerService.getActiveOwnerPhoneNumber()
        if (!ownerPhoneNumber) {
          return
        }

        const now = getTimeParts(config.SCHEDULE_TIME_ZONE)
        const executionKey = `${now.dateKey}-${now.minuteKey}`
        const schedules = await NotificationSchedule.find({ where: { isActive: true, ownerPhoneNumber } })

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