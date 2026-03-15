import { NextFunction, Request, Response } from 'express'
import { groupService } from '@/services/group.service'
import { whatsappService } from '@/services/whatsapp.service'

export async function getSessionStatus(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(whatsappService.getSessionState())
  } catch (error) {
    next(error)
  }
}

export async function connectSession(req: Request, res: Response, next: NextFunction) {
  try {
    const session = await whatsappService.start()
    res.json(session)
  } catch (error) {
    next(error)
  }
}

export async function disconnectSession(req: Request, res: Response, next: NextFunction) {
  try {
    const session = await whatsappService.stop()
    res.json(session)
  } catch (error) {
    next(error)
  }
}

export async function resetSession(req: Request, res: Response, next: NextFunction) {
  try {
    const session = await whatsappService.reset()
    res.json(session)
  } catch (error) {
    next(error)
  }
}

export async function listGroups(req: Request, res: Response, next: NextFunction) {
  try {
    const groups = await groupService.list()
    res.json(groups)
  } catch (error) {
    next(error)
  }
}

export async function syncGroups(req: Request, res: Response, next: NextFunction) {
  try {
    const groups = await whatsappService.syncGroups()
    res.json(groups)
  } catch (error) {
    next(error)
  }
}