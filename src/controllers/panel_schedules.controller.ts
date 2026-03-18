import { NextFunction, Request, Response } from 'express'
import { NotificationDispatch } from '@/entities/notification_dispatch.entity'
import { OutboundMessage } from '@/entities/outbound_message.entity'
import { groupService } from '@/services/group.service'
import { notificationScheduleService } from '@/services/notification_schedule.service'
import { panelAdminService } from '@/services/panel_admin.service'
import { sessionOwnerService } from '@/services/session_owner.service'
import { whatsappService } from '@/services/whatsapp.service'
import { NotFound } from '@/middlewares/error_handler'
import { Raw } from 'typeorm'
import logger from '@/utils/logger'
import { sleep } from '@/utils/sleep'

const REVOKE_DELAY_MS = 800

async function normalizeScheduleGroups(ownerPhoneNumber: string, scheduleId: string, groupJids: string[]) {
  const normalized = Array.from(new Set(await groupService.resolveGroupJids(ownerPhoneNumber, groupJids, { activeOnly: true })))
  const shouldDeactivate = normalized.length === 0

  if (normalized.length !== groupJids.length || normalized.some((value, index) => value !== groupJids[index])) {
    await notificationScheduleService.update(ownerPhoneNumber, scheduleId, {
      groupJids: normalized,
      isActive: shouldDeactivate ? false : undefined,
    })
  }

  return { groupJids: normalized, isActive: shouldDeactivate ? false : undefined }
}

async function mapScheduleResponse(ownerPhoneNumber: string, scheduleId: string) {
  const schedule = await notificationScheduleService.findById(ownerPhoneNumber, scheduleId)
  const lastDispatch = await NotificationDispatch.findOne({ where: { ownerPhoneNumber, schedule: { id: schedule.id } }, order: { executedAt: 'DESC' } })
  return panelAdminService.mapSchedule(schedule, lastDispatch)
}

function normalizePayload(body: Record<string, unknown>) {
  return {
    name: String(body.name || ''),
    messageIds: Array.isArray(body.messageIds) ? body.messageIds.map((item) => String(item)) : [],
    groupIds: Array.isArray(body.groupIds) ? body.groupIds.map((item) => String(item)) : [],
    days: Array.isArray(body.days) ? body.days.map((item) => String(item)) : [],
    time: String(body.time || '08:00'),
    isActive: typeof body.isActive === 'boolean' ? body.isActive : undefined,
  }
}

export async function listSchedules(_req: Request, res: Response, next: NextFunction) {
  try {
    const ownerPhoneNumber = sessionOwnerService.getActiveOwnerPhoneNumber()
    if (!ownerPhoneNumber) {
      res.json([])
      return
    }

    const schedules = await notificationScheduleService.list(ownerPhoneNumber)
    const dispatches = await notificationScheduleService.listDispatchHistory(ownerPhoneNumber, 500)
    const lastDispatchBySchedule = new Map<string, NotificationDispatch>()

    for (const dispatch of dispatches) {
      if (!dispatch.schedule?.id || lastDispatchBySchedule.has(dispatch.schedule.id)) {
        continue
      }
      lastDispatchBySchedule.set(dispatch.schedule.id, dispatch)
    }

    for (const schedule of schedules) {
      const normalized = await normalizeScheduleGroups(ownerPhoneNumber, schedule.id, schedule.groupJids || [])
      schedule.groupJids = normalized.groupJids
      if (normalized.isActive !== undefined) {
        schedule.isActive = normalized.isActive
      }
    }

    res.json(schedules.map((schedule) => panelAdminService.mapSchedule(schedule, lastDispatchBySchedule.get(schedule.id))))
  } catch (error) {
    next(error)
  }
}

export async function createSchedule(req: Request, res: Response, next: NextFunction) {
  try {
    const ownerPhoneNumber = sessionOwnerService.requireActiveOwnerPhoneNumber()
    const payload = normalizePayload(req.body ?? {})
    const groupJids = await groupService.resolveGroupJids(ownerPhoneNumber, payload.groupIds, { activeOnly: true })
    const schedule = await notificationScheduleService.create(ownerPhoneNumber, {
      name: payload.name,
      daysOfWeek: panelAdminService.toScheduleDays(payload.days),
      times: [payload.time],
      groupJids,
      messageTemplateIds: payload.messageIds,
    })
    res.status(201).json(await mapScheduleResponse(ownerPhoneNumber, schedule.id))
  } catch (error) {
    next(error)
  }
}

export async function updateSchedule(req: Request, res: Response, next: NextFunction) {
  try {
    const ownerPhoneNumber = sessionOwnerService.requireActiveOwnerPhoneNumber()
    const scheduleId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    const payload = normalizePayload(req.body ?? {})
    const groupJids = await groupService.resolveGroupJids(ownerPhoneNumber, payload.groupIds, { activeOnly: true })
    await notificationScheduleService.update(ownerPhoneNumber, scheduleId, {
      name: payload.name,
      daysOfWeek: panelAdminService.toScheduleDays(payload.days),
      times: [payload.time],
      groupJids,
      messageTemplateIds: payload.messageIds,
    })
    res.json(await mapScheduleResponse(ownerPhoneNumber, scheduleId))
  } catch (error) {
    next(error)
  }
}

export async function deleteSchedule(req: Request, res: Response, next: NextFunction) {
  try {
    const ownerPhoneNumber = sessionOwnerService.requireActiveOwnerPhoneNumber()
    const scheduleId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    res.json(await notificationScheduleService.remove(ownerPhoneNumber, scheduleId))
  } catch (error) {
    next(error)
  }
}

export async function getDispatchHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const ownerPhoneNumber = sessionOwnerService.getActiveOwnerPhoneNumber()
    if (!ownerPhoneNumber) {
      res.json([])
      return
    }

    const history = await notificationScheduleService.listDispatchHistory(ownerPhoneNumber)

    // Batch-fetch sent outbound messages to determine which dispatches have a stored WA message ID
    const sentMessages = await OutboundMessage.find({
      where: { ownerPhoneNumber, sourceType: 'SCHEDULE', status: 'SENT' },
      select: ['metadata'],
    })
    const revocableDispatchIds = new Set(
      sentMessages
        .filter((m) => typeof m.metadata?.dispatchId === 'string' && typeof m.metadata?.whatsappMessageId === 'string')
        .map((m) => m.metadata!.dispatchId as string),
    )

    res.json(history.map((d) => panelAdminService.mapSentMessage(d, undefined, revocableDispatchIds.has(d.id))))
  } catch (error) {
    next(error)
  }
}

async function revokeDispatchFromWhatsapp(ownerPhoneNumber: string, dispatchId: string): Promise<void> {
  const outboundMessages = await OutboundMessage.find({
    where: {
      ownerPhoneNumber,
      sourceType: 'SCHEDULE',
      status: 'SENT',
      metadata: Raw((alias) => `${alias} @> :meta::jsonb`, { meta: JSON.stringify({ dispatchId }) }),
    },
  })

  if (!whatsappService.isConnected()) return

  for (const msg of outboundMessages) {
    const waMessageId = typeof msg.metadata?.whatsappMessageId === 'string' ? msg.metadata.whatsappMessageId : undefined
    if (waMessageId) {
      try {
        await whatsappService.deleteMessageNow(msg.recipientJid, waMessageId)
      } catch (err) {
        logger.warn(`revokeDispatch: failed to delete WA message ${waMessageId} in ${msg.recipientJid}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }
}

export async function deleteDispatch(req: Request, res: Response, next: NextFunction) {
  try {
    const ownerPhoneNumber = sessionOwnerService.requireActiveOwnerPhoneNumber()
    const dispatchId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    const dispatch = await NotificationDispatch.findOne({ where: { id: dispatchId, ownerPhoneNumber } })
    if (!dispatch) throw NotFound('Registro no encontrado')

    await revokeDispatchFromWhatsapp(ownerPhoneNumber, dispatchId)
    await dispatch.remove()
    res.json({ success: true })
  } catch (error) {
    next(error)
  }
}

export async function deleteDispatchBatch(req: Request, res: Response, next: NextFunction) {
  try {
    const ownerPhoneNumber = sessionOwnerService.requireActiveOwnerPhoneNumber()
    const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : []

    let deleted = 0
    for (let i = 0; i < ids.length; i++) {
      const dispatchId = ids[i]!
      const dispatch = await NotificationDispatch.findOne({ where: { id: dispatchId, ownerPhoneNumber } })
      if (!dispatch) continue

      await revokeDispatchFromWhatsapp(ownerPhoneNumber, dispatchId)
      await dispatch.remove()
      deleted++

      if (i < ids.length - 1) await sleep(REVOKE_DELAY_MS)
    }

    res.json({ deleted })
  } catch (error) {
    next(error)
  }
}

export async function toggleSchedule(req: Request, res: Response, next: NextFunction) {
  try {
    const ownerPhoneNumber = sessionOwnerService.requireActiveOwnerPhoneNumber()
    const scheduleId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    const isActive = req.path.endsWith('/activate')
    await notificationScheduleService.update(ownerPhoneNumber, scheduleId, { isActive })
    res.json(await mapScheduleResponse(ownerPhoneNumber, scheduleId))
  } catch (error) {
    next(error)
  }
}