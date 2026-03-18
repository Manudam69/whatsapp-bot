import { NextFunction, Request, Response } from 'express'
import QRCode from 'qrcode'
import { panelAdminService } from '@/services/panel_admin.service'
import { whatsappSessionManager } from '@/services/whatsapp_session_manager.service'
import { antibanService } from '@/services/antiban.service'

function resolveSessionId(req: Request): string | undefined {
  const clientId = req.authUser!.clientId
  const queriedId = typeof req.query.sessionId === 'string' ? req.query.sessionId : undefined
  if (queriedId) {
    const session = whatsappSessionManager.getSession(queriedId)
    return session?.clientId === clientId ? queriedId : undefined
  }
  const sessions = whatsappSessionManager.getSessionsByClientId(clientId)
  return sessions[0]?.sessionId
}

export async function getSession(req: Request, res: Response, next: NextFunction) {
  try {
    const sessionId = resolveSessionId(req)
    if (!sessionId) {
      res.json(panelAdminService.mapSession({ status: 'idle' }))
      return
    }

    const state = whatsappSessionManager.getSessionState(sessionId)
    const session = panelAdminService.mapSession(state)
    if (state.qr) {
      session.qrCode = await QRCode.toDataURL(state.qr)
    }
    res.json(session)
  } catch (error) {
    next(error)
  }
}

export async function disconnectSession(req: Request, res: Response, next: NextFunction) {
  try {
    const sessionId = resolveSessionId(req)
    if (!sessionId) {
      res.json(panelAdminService.mapSession({ status: 'idle' }))
      return
    }

    const state = await whatsappSessionManager.stopSession(sessionId) ?? { status: 'idle' as const }
    const mapped = panelAdminService.mapSession(state)
    if (state.qr) {
      mapped.qrCode = await QRCode.toDataURL(state.qr)
    }
    res.json(mapped)
  } catch (error) {
    next(error)
  }
}

export async function resetSession(req: Request, res: Response, next: NextFunction) {
  try {
    const sessionId = resolveSessionId(req)
    if (!sessionId) {
      res.json(panelAdminService.mapSession({ status: 'idle' }))
      return
    }

    const state = await whatsappSessionManager.resetSession(sessionId) ?? { status: 'idle' as const }
    const mapped = panelAdminService.mapSession(state)
    if (state.qr) {
      mapped.qrCode = await QRCode.toDataURL(state.qr)
    }
    res.json(mapped)
  } catch (error) {
    next(error)
  }
}

export function getAntibanStats(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(antibanService.getStats())
  } catch (error) {
    next(error)
  }
}

export function controlAntiban(req: Request, res: Response, next: NextFunction) {
  try {
    const action = (req.body as { action?: string })?.action
    if (action === 'pause') {
      antibanService.pause()
      return res.json({ ok: true, message: 'Envío pausado manualmente.' })
    }
    if (action === 'resume') {
      antibanService.resume()
      return res.json({ ok: true, message: 'Envío reanudado.' })
    }
    return res.status(400).json({ ok: false, message: 'Acción inválida. Usa "pause" o "resume".' })
  } catch (error) {
    next(error)
  }
}
