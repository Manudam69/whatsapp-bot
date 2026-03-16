import { NextFunction, Request, Response } from 'express'
import { NotificationDispatch } from '@/entities/notification_dispatch.entity'
import { autoMessageService } from '@/services/auto_message.service'
import { groupService } from '@/services/group.service'
import { notificationScheduleService } from '@/services/notification_schedule.service'
import { panelAdminService } from '@/services/panel_admin.service'

async function mapScheduleResponse(scheduleId: string) {
  const schedule = await notificationScheduleService.findById(scheduleId)
  const lastDispatch = await NotificationDispatch.findOne({ where: { schedule: { id: schedule.id } }, order: { executedAt: 'DESC' } })
  return panelAdminService.mapSchedule(schedule, lastDispatch)
}

function normalizePayload(body: Record<string, unknown>) {
  return {
    name: String(body.name || ''),
    messageId: String(body.messageId || ''),
    groupIds: Array.isArray(body.groupIds) ? body.groupIds.map((item) => String(item)) : [],
    days: Array.isArray(body.days) ? body.days.map((item) => String(item)) : [],
    time: String(body.time || '08:00'),
    isActive: typeof body.isActive === 'boolean' ? body.isActive : undefined,
  }
}

export async function listSchedules(req: Request, res: Response, next: NextFunction) {
  try {
    const schedules = await notificationScheduleService.list()
    const dispatches = await notificationScheduleService.listDispatchHistory(500)
    const lastDispatchBySchedule = new Map<string, NotificationDispatch>()

    for (const dispatch of dispatches) {
      if (!dispatch.schedule?.id || lastDispatchBySchedule.has(dispatch.schedule.id)) {
        continue
      }
      lastDispatchBySchedule.set(dispatch.schedule.id, dispatch)
    }

    res.json(schedules.map((schedule) => panelAdminService.mapSchedule(schedule, lastDispatchBySchedule.get(schedule.id))))
  } catch (error) {
    next(error)
  }
}

export async function createSchedule(req: Request, res: Response, next: NextFunction) {
  try {
    const payload = normalizePayload(req.body ?? {})
    const message = await autoMessageService.findById(payload.messageId)
    const groupJids = await groupService.resolveGroupJids(payload.groupIds)
    const schedule = await notificationScheduleService.create({
      name: payload.name,
      messageText: message.content,
      daysOfWeek: panelAdminService.toScheduleDays(payload.days),
      times: [payload.time],
      groupJids,
      messageTemplateId: message.id,
      mediaAssetId: message.image?.id,
      isActive: true,
    })
    res.status(201).json(await mapScheduleResponse(schedule.id))
  } catch (error) {
    next(error)
  }
}

export async function updateSchedule(req: Request, res: Response, next: NextFunction) {
  try {
    const scheduleId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    const payload = normalizePayload(req.body ?? {})
    const message = await autoMessageService.findById(payload.messageId)
    const groupJids = await groupService.resolveGroupJids(payload.groupIds)
    await notificationScheduleService.update(scheduleId, {
      name: payload.name,
      messageText: message.content,
      daysOfWeek: panelAdminService.toScheduleDays(payload.days),
      times: [payload.time],
      groupJids,
      messageTemplateId: message.id,
      mediaAssetId: message.image?.id,
    })
    res.json(await mapScheduleResponse(scheduleId))
  } catch (error) {
    next(error)
  }
}

export async function deleteSchedule(req: Request, res: Response, next: NextFunction) {
  try {
    const scheduleId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    res.json(await notificationScheduleService.remove(scheduleId))
  } catch (error) {
    next(error)
  }
}

export async function toggleSchedule(req: Request, res: Response, next: NextFunction) {
  try {
    const scheduleId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    const isActive = req.path.endsWith('/activate')
    await notificationScheduleService.update(scheduleId, { isActive })
    res.json(await mapScheduleResponse(scheduleId))
  } catch (error) {
    next(error)
  }
}