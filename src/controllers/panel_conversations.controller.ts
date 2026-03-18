import { NextFunction, Request, Response } from 'express'
import { panelConversationsService } from '@/services/panel_conversations.service'

export async function listConversations(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = req.authUser!.clientId
    res.json(await panelConversationsService.list(req, clientId))
  } catch (error) {
    next(error)
  }
}

export async function getConversation(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = req.authUser!.clientId
    const contactId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    res.json(await panelConversationsService.getByContactId(req, clientId, contactId))
  } catch (error) {
    next(error)
  }
}