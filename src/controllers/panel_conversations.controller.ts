import { NextFunction, Request, Response } from 'express'
import { panelConversationsService } from '@/services/panel_conversations.service'
import { sessionOwnerService } from '@/services/session_owner.service'

export async function listConversations(req: Request, res: Response, next: NextFunction) {
  try {
    const ownerPhoneNumber = sessionOwnerService.getActiveOwnerPhoneNumber()
    if (!ownerPhoneNumber) {
      res.json([])
      return
    }

    res.json(await panelConversationsService.list(req, ownerPhoneNumber))
  } catch (error) {
    next(error)
  }
}

export async function getConversation(req: Request, res: Response, next: NextFunction) {
  try {
    const ownerPhoneNumber = sessionOwnerService.requireActiveOwnerPhoneNumber()
    const contactId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    res.json(await panelConversationsService.getByContactId(req, ownerPhoneNumber, contactId))
  } catch (error) {
    next(error)
  }
}