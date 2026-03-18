import { NextFunction, Request, Response } from 'express'
import { In } from 'typeorm'
import { WhatsappGroup } from '@/entities/whatsapp_group.entity'
import { whatsappSessionManager } from '@/services/whatsapp_session_manager.service'

function resolveSessionId(req: Request): string | undefined {
  const clientId = req.authUser?.clientId
  if (!clientId) return undefined

  const queriedId = typeof req.query.sessionId === 'string' ? req.query.sessionId
    : typeof req.body?.sessionId === 'string' ? req.body.sessionId
      : undefined

  if (queriedId) {
    const session = whatsappSessionManager.getSession(queriedId)
    return session?.clientId === clientId ? queriedId : undefined
  }

  const sessions = whatsappSessionManager.getSessionsByClientId(clientId)
  return sessions[0]?.sessionId
}

export async function getSessionStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const sessionId = resolveSessionId(req)
    res.json(sessionId ? whatsappSessionManager.getSessionState(sessionId) : { status: 'idle' })
  } catch (error) {
    next(error)
  }
}

export async function connectSession(req: Request, res: Response, next: NextFunction) {
  try {
    const sessionId = resolveSessionId(req)
    if (!sessionId) {
      res.json({ status: 'idle' })
      return
    }
    const session = whatsappSessionManager.getSession(sessionId)
    if (!session) {
      res.json({ status: 'idle' })
      return
    }
    res.json(await session.start())
  } catch (error) {
    next(error)
  }
}

export async function disconnectSession(req: Request, res: Response, next: NextFunction) {
  try {
    const sessionId = resolveSessionId(req)
    res.json(sessionId ? await whatsappSessionManager.stopSession(sessionId) ?? { status: 'idle' } : { status: 'idle' })
  } catch (error) {
    next(error)
  }
}

export async function resetSession(req: Request, res: Response, next: NextFunction) {
  try {
    const sessionId = resolveSessionId(req)
    res.json(sessionId ? await whatsappSessionManager.resetSession(sessionId) ?? { status: 'idle' } : { status: 'idle' })
  } catch (error) {
    next(error)
  }
}

export async function listGroups(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = req.authUser?.clientId
    if (!clientId) {
      res.json([])
      return
    }

    const sessions = whatsappSessionManager.getSessionsByClientId(clientId)
    const sessionIds = sessions.map((s) => s.sessionId)

    await Promise.allSettled(
      sessions.filter((s) => s.isConnected()).map((s) => s.syncGroups()),
    )

    const groups = sessionIds.length > 0
      ? await WhatsappGroup.find({ where: { sessionId: In(sessionIds), isMember: true }, order: { name: 'ASC' } })
      : []

    res.json(groups)
  } catch (error) {
    next(error)
  }
}

export async function syncGroups(req: Request, res: Response, next: NextFunction) {
  try {
    const sessionId = resolveSessionId(req)
    if (!sessionId) {
      res.json([])
      return
    }

    const session = whatsappSessionManager.getSession(sessionId)
    const groups = session ? await session.syncGroups() : []
    res.json(groups)
  } catch (error) {
    next(error)
  }
}
