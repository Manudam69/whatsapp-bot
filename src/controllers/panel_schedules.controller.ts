import { NextFunction, Request, Response } from 'express'
import { In, Raw } from 'typeorm'
import { NotificationDispatch } from '@/entities/notification_dispatch.entity'
import { OutboundMessage } from '@/entities/outbound_message.entity'
import { groupService } from '@/services/group.service'
import { notificationScheduleService } from '@/services/notification_schedule.service'
import { panelAdminService } from '@/services/panel_admin.service'
import { sseService } from '@/services/sse.service'
import { whatsappSessionManager } from '@/services/whatsapp_session_manager.service'
import { NotFound } from '@/middlewares/error_handler'
import logger from '@/utils/logger'
import { sleep } from '@/utils/sleep'

const REVOKE_DELAY_MS = 800

function getFirstSessionId(clientId: string): string | undefined {
  const sessions = whatsappSessionManager.getSessionsByClientId(clientId)
  const connected = sessions.find((s) => s.isConnected())
  return (connected ?? sessions[0])?.sessionId
}

function getClientSessionIds(clientId: string): string[] {
  return whatsappSessionManager.getSessionsByClientId(clientId).map((s) => s.sessionId)
}

async function normalizeScheduleGroups(clientId: string, sessionId: string, scheduleId: string, groupJids: string[]) {
  const normalized = Array.from(new Set(await groupService.resolveGroupJids(sessionId, groupJids, { activeOnly: true })))
  const shouldDeactivate = normalized.length === 0

  if (normalized.length !== groupJids.length || normalized.some((value, index) => value !== groupJids[index])) {
    await notificationScheduleService.update(clientId, scheduleId, {
      groupJids: normalized,
      isActive: shouldDeactivate ? false : undefined,
    })
  }

  return { groupJids: normalized, isActive: shouldDeactivate ? false : undefined }
}

async function mapScheduleResponse(clientId: string, scheduleId: string) {
  const schedule = await notificationScheduleService.findById(clientId, scheduleId)
  const lastDispatch = await NotificationDispatch.findOne({ where: { clientId, schedule: { id: schedule.id } }, order: { executedAt: 'DESC' } })
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

export async function listSchedules(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = req.authUser!.clientId
    const sessionId = getFirstSessionId(clientId)

    const schedules = await notificationScheduleService.list(clientId)
    const dispatches = await notificationScheduleService.listDispatchHistory(clientId, 500)
    const lastDispatchBySchedule = new Map<string, NotificationDispatch>()

    for (const dispatch of dispatches) {
      if (!dispatch.schedule?.id || lastDispatchBySchedule.has(dispatch.schedule.id)) {
        continue
      }
      lastDispatchBySchedule.set(dispatch.schedule.id, dispatch)
    }

    if (sessionId) {
      for (const schedule of schedules) {
        const normalized = await normalizeScheduleGroups(clientId, sessionId, schedule.id, schedule.groupJids || [])
        schedule.groupJids = normalized.groupJids
        if (normalized.isActive !== undefined) {
          schedule.isActive = normalized.isActive
        }
      }
    }

    res.json(schedules.map((schedule) => panelAdminService.mapSchedule(schedule, lastDispatchBySchedule.get(schedule.id))))
  } catch (error) {
    next(error)
  }
}

export async function createSchedule(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = req.authUser!.clientId
    const sessionId = getFirstSessionId(clientId)
    const payload = normalizePayload(req.body ?? {})
    const groupJids = sessionId
      ? await groupService.resolveGroupJids(sessionId, payload.groupIds, { activeOnly: true })
      : payload.groupIds

    const schedule = await notificationScheduleService.create(clientId, {
      name: payload.name,
      daysOfWeek: panelAdminService.toScheduleDays(payload.days),
      times: [payload.time],
      groupJids,
      messageTemplateIds: payload.messageIds,
    })
    const created = await mapScheduleResponse(clientId, schedule.id)
    sseService.emit(clientId, 'schedule:created', created)
    sseService.emit(clientId, 'dashboard:refresh')
    res.status(201).json(created)
  } catch (error) {
    next(error)
  }
}

export async function updateSchedule(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = req.authUser!.clientId
    const sessionId = getFirstSessionId(clientId)
    const scheduleId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    const payload = normalizePayload(req.body ?? {})
    const groupJids = sessionId
      ? await groupService.resolveGroupJids(sessionId, payload.groupIds, { activeOnly: true })
      : payload.groupIds

    await notificationScheduleService.update(clientId, scheduleId, {
      name: payload.name,
      daysOfWeek: panelAdminService.toScheduleDays(payload.days),
      times: [payload.time],
      groupJids,
      messageTemplateIds: payload.messageIds,
    })
    const updated = await mapScheduleResponse(clientId, scheduleId)
    sseService.emit(clientId, 'schedule:updated', updated)
    sseService.emit(clientId, 'dashboard:refresh')
    res.json(updated)
  } catch (error) {
    next(error)
  }
}

export async function deleteSchedule(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = req.authUser!.clientId
    const scheduleId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    const result = await notificationScheduleService.remove(clientId, scheduleId)
    sseService.emit(clientId, 'schedule:deleted', { id: scheduleId })
    sseService.emit(clientId, 'dashboard:refresh')
    res.json(result)
  } catch (error) {
    next(error)
  }
}

export async function getDispatchHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = req.authUser!.clientId
    const sessionIds = getClientSessionIds(clientId)

    const history = await notificationScheduleService.listDispatchHistory(clientId)

    const sentMessages = sessionIds.length > 0
      ? await OutboundMessage.find({
        where: { sessionId: In(sessionIds), sourceType: 'SCHEDULE', status: 'SENT' },
        select: ['metadata'],
      })
      : []

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

async function revokeDispatchFromWhatsapp(_clientId: string, sessionIds: string[], dispatchId: string): Promise<void> {
  if (sessionIds.length === 0) return

  const outboundMessages = await OutboundMessage.find({
    where: {
      sessionId: In(sessionIds),
      sourceType: 'SCHEDULE',
      status: 'SENT',
      metadata: Raw((alias) => `${alias} @> :meta::jsonb`, { meta: JSON.stringify({ dispatchId }) }),
    },
  })

  for (const msg of outboundMessages) {
    const session = whatsappSessionManager.getSession(msg.sessionId)
    if (!session?.isConnected()) continue

    const waMessageId = typeof msg.metadata?.whatsappMessageId === 'string' ? msg.metadata.whatsappMessageId : undefined
    if (waMessageId) {
      try {
        await session.deleteMessageNow(msg.recipientJid, waMessageId)
      } catch (err) {
        logger.warn(`revokeDispatch: failed to delete WA message ${waMessageId} in ${msg.recipientJid}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }
}

export async function deleteDispatch(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = req.authUser!.clientId
    const sessionIds = getClientSessionIds(clientId)
    const dispatchId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    const dispatch = await NotificationDispatch.findOne({ where: { id: dispatchId, clientId } })
    if (!dispatch) throw NotFound('Registro no encontrado')

    await revokeDispatchFromWhatsapp(clientId, sessionIds, dispatchId)
    await dispatch.remove()
    res.json({ success: true })
  } catch (error) {
    next(error)
  }
}

export async function deleteDispatchBatch(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = req.authUser!.clientId
    const sessionIds = getClientSessionIds(clientId)
    const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : []

    let deleted = 0
    for (let i = 0; i < ids.length; i++) {
      const dispatchId = ids[i]!
      const dispatch = await NotificationDispatch.findOne({ where: { id: dispatchId, clientId } })
      if (!dispatch) continue

      await revokeDispatchFromWhatsapp(clientId, sessionIds, dispatchId)
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
    const clientId = req.authUser!.clientId
    const scheduleId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    const isActive = req.path.endsWith('/activate')
    await notificationScheduleService.update(clientId, scheduleId, { isActive })
    const toggled = await mapScheduleResponse(clientId, scheduleId)
    sseService.emit(clientId, 'schedule:updated', toggled)
    sseService.emit(clientId, 'dashboard:refresh')
    res.json(toggled)
  } catch (error) {
    next(error)
  }
}
