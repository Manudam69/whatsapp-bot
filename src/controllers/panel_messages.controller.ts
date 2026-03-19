import { NextFunction, Request, Response } from 'express'
import { NotificationSchedule } from '@/entities/notification_schedule.entity'
import { autoMessageService } from '@/services/auto_message.service'
import { groupService } from '@/services/group.service'
import { notificationScheduleService } from '@/services/notification_schedule.service'
import { panelAdminService } from '@/services/panel_admin.service'
import { sseService } from '@/services/sse.service'
import { whatsappSessionManager } from '@/services/whatsapp_session_manager.service'

function getFirstSessionId(clientId: string): string | undefined {
  const sessions = whatsappSessionManager.getSessionsByClientId(clientId)
  const connected = sessions.find((s) => s.isConnected())
  return (connected ?? sessions[0])?.sessionId
}

async function normalizeMessageGroups(clientId: string, sessionId: string, messageId: string, groupIds: string[]) {
  const normalizedGroupIds = await groupService.resolveGroupJids(sessionId, groupIds, { activeOnly: true })
  const uniqueGroupIds = Array.from(new Set(normalizedGroupIds))

  if (uniqueGroupIds.length === groupIds.length && uniqueGroupIds.every((value, index) => value === groupIds[index])) {
    return uniqueGroupIds
  }

  await autoMessageService.update(clientId, messageId, { groupIds: uniqueGroupIds })
  return uniqueGroupIds
}

export async function listMessages(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = req.authUser!.clientId
    const sessionId = getFirstSessionId(clientId)

    const messages = await autoMessageService.list(clientId)
    if (sessionId) {
      for (const message of messages) {
        message.groupIds = await normalizeMessageGroups(clientId, sessionId, message.id, message.groupIds || [])
      }
    }

    res.json(messages.map((message) => panelAdminService.mapMessage(message)))
  } catch (error) {
    next(error)
  }
}

export async function createMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = req.authUser!.clientId
    const sessionId = getFirstSessionId(clientId)
    const rawGroupIds = Array.isArray(req.body?.groupIds) ? req.body.groupIds.map((value: unknown) => String(value)) : []
    const groupIds = sessionId
      ? Array.from(new Set(await groupService.resolveGroupJids(sessionId, rawGroupIds, { activeOnly: true })))
      : rawGroupIds

    const message = await autoMessageService.create(clientId, {
      ...req.body,
      groupIds,
    })
    const created = panelAdminService.mapMessage(message)
    sseService.emit(clientId, 'message:created', created)
    res.status(201).json(created)
  } catch (error) {
    next(error)
  }
}

export async function updateMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = req.authUser!.clientId
    const sessionId = getFirstSessionId(clientId)
    const messageId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id

    let groupIds: string[] | undefined
    if (req.body?.groupIds !== undefined) {
      const rawGroupIds = Array.isArray(req.body.groupIds) ? req.body.groupIds.map((value: unknown) => String(value)) : []
      groupIds = sessionId
        ? Array.from(new Set(await groupService.resolveGroupJids(sessionId, rawGroupIds, { activeOnly: true })))
        : rawGroupIds
    }

    const message = await autoMessageService.update(clientId, messageId, {
      ...req.body,
      groupIds,
    })
    const updated = panelAdminService.mapMessage(message)
    sseService.emit(clientId, 'message:updated', updated)
    res.json(updated)
  } catch (error) {
    next(error)
  }
}

export async function deleteMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = req.authUser!.clientId
    const messageId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    const result = await autoMessageService.remove(clientId, messageId)
    await NotificationSchedule.createQueryBuilder()
      .update()
      .set({ messageTemplateId: () => 'NULL', messageText: () => 'NULL' })
      .where('client_id = :clientId', { clientId })
      .andWhere('message_template_id = :messageId', { messageId })
      .execute()
    sseService.emit(clientId, 'message:deleted', { id: messageId })
    res.json(result)
  } catch (error) {
    next(error)
  }
}

export async function listMessageHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = req.authUser!.clientId
    const history = await notificationScheduleService.listDispatchHistory(clientId)
    const mapped = history.map((dispatch) => panelAdminService.mapSentMessage(dispatch, dispatch.schedule?.name))
    res.json(mapped)
  } catch (error) {
    next(error)
  }
}
