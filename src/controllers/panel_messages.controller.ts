import { NextFunction, Request, Response } from 'express'
import { NotificationSchedule } from '@/entities/notification_schedule.entity'
import { autoMessageService } from '@/services/auto_message.service'
import { groupService } from '@/services/group.service'
import { notificationScheduleService } from '@/services/notification_schedule.service'
import { panelAdminService } from '@/services/panel_admin.service'
import { sessionOwnerService } from '@/services/session_owner.service'

async function normalizeMessageGroups(ownerPhoneNumber: string, messageId: string, groupIds: string[]) {
  const normalizedGroupIds = await groupService.resolveGroupJids(ownerPhoneNumber, groupIds, { activeOnly: true })
  const uniqueGroupIds = Array.from(new Set(normalizedGroupIds))

  if (uniqueGroupIds.length === groupIds.length && uniqueGroupIds.every((value, index) => value === groupIds[index])) {
    return uniqueGroupIds
  }

  await autoMessageService.update(ownerPhoneNumber, messageId, { groupIds: uniqueGroupIds })
  return uniqueGroupIds
}

export async function listMessages(req: Request, res: Response, next: NextFunction) {
  try {
    const ownerPhoneNumber = sessionOwnerService.getActiveOwnerPhoneNumber()
    if (!ownerPhoneNumber) {
      res.json([])
      return
    }

    const messages = await autoMessageService.list(ownerPhoneNumber)
    for (const message of messages) {
      message.groupIds = await normalizeMessageGroups(ownerPhoneNumber, message.id, message.groupIds || [])
    }

    res.json(messages.map((message) => panelAdminService.mapMessage(message)))
  } catch (error) {
    next(error)
  }
}

export async function createMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const ownerPhoneNumber = sessionOwnerService.requireActiveOwnerPhoneNumber()
    const groupIds = await groupService.resolveGroupJids(ownerPhoneNumber, Array.isArray(req.body?.groupIds) ? req.body.groupIds.map((value: unknown) => String(value)) : [], { activeOnly: true })
    const message = await autoMessageService.create(ownerPhoneNumber, {
      ...req.body,
      groupIds: Array.from(new Set(groupIds)),
    })
    res.status(201).json(panelAdminService.mapMessage(message))
  } catch (error) {
    next(error)
  }
}

export async function updateMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const ownerPhoneNumber = sessionOwnerService.requireActiveOwnerPhoneNumber()
    const messageId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    const groupIds = req.body?.groupIds === undefined
      ? undefined
      : Array.from(new Set(await groupService.resolveGroupJids(ownerPhoneNumber, Array.isArray(req.body.groupIds) ? req.body.groupIds.map((value: unknown) => String(value)) : [], { activeOnly: true })))
    const message = await autoMessageService.update(ownerPhoneNumber, messageId, {
      ...req.body,
      groupIds,
    })
    res.json(panelAdminService.mapMessage(message))
  } catch (error) {
    next(error)
  }
}

export async function deleteMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const ownerPhoneNumber = sessionOwnerService.requireActiveOwnerPhoneNumber()
    const messageId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    const result = await autoMessageService.remove(ownerPhoneNumber, messageId)
    await NotificationSchedule.createQueryBuilder()
      .update()
      .set({ messageTemplateId: () => 'NULL', messageText: () => 'NULL' })
      .where('owner_phone_number = :ownerPhoneNumber', { ownerPhoneNumber })
      .andWhere('message_template_id = :messageId', { messageId })
      .execute()
    res.json(result)
  } catch (error) {
    next(error)
  }
}

export async function listMessageHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const ownerPhoneNumber = sessionOwnerService.getActiveOwnerPhoneNumber()
    if (!ownerPhoneNumber) {
      res.json([])
      return
    }

    const history = await notificationScheduleService.listDispatchHistory(ownerPhoneNumber)
    const mapped = history.map((dispatch) => panelAdminService.mapSentMessage(dispatch, dispatch.schedule?.name))
    res.json(mapped)
  } catch (error) {
    next(error)
  }
}