import { NextFunction, Request, Response } from 'express'
import QRCode from 'qrcode'
import { panelAdminService } from '@/services/panel_admin.service'
import { whatsappService } from '@/services/whatsapp.service'
import { antibanService } from '@/services/antiban.service'

export async function getSession(req: Request, res: Response, next: NextFunction) {
  try {
    const state = whatsappService.getSessionState()
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
    const session = await whatsappService.stop()
    const mapped = panelAdminService.mapSession(session)
    if (session.qr) {
      mapped.qrCode = await QRCode.toDataURL(session.qr)
    }
    res.json(mapped)
  } catch (error) {
    next(error)
  }
}

export async function resetSession(req: Request, res: Response, next: NextFunction) {
  try {
    const session = await whatsappService.reset()
    const mapped = panelAdminService.mapSession(session)
    if (session.qr) {
      mapped.qrCode = await QRCode.toDataURL(session.qr)
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