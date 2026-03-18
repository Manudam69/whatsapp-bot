import { NextFunction, Request, Response } from 'express'
import { Forbidden, Unauthorized } from './error_handler'
import { authService } from '@/services/auth.service'

function getBearerToken(req: Request) {
  const authorization = req.headers.authorization
  if (!authorization?.startsWith('Bearer ')) {
    throw Unauthorized('Debes iniciar sesión para continuar.')
  }

  return authorization.slice('Bearer '.length).trim()
}

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = getBearerToken(req)
    req.authUser = await authService.verifyToken(token)
    next()
  } catch (error) {
    next(error)
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.authUser) {
      throw Unauthorized('Debes iniciar sesión para continuar.')
    }
    if (req.authUser.role !== 'admin') {
      throw Forbidden('Esta acción requiere permisos de administrador.')
    }

    next()
  } catch (error) {
    next(error)
  }
}

export function requireAdminOrAgent(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.authUser) {
      throw Unauthorized('Debes iniciar sesión para continuar.')
    }
    if (req.authUser.role !== 'admin' && req.authUser.role !== 'agent') {
      throw Forbidden('No tienes permisos para realizar esta acción.')
    }

    next()
  } catch (error) {
    next(error)
  }
}

/**
 * Verifica que el cliente del usuario tenga al menos una sesión de WhatsApp conectada.
 * Se usa para operaciones que requieren que el bot esté activo (ej: sincronizar grupos).
 */
export async function requireConnectedWhatsappSession(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.authUser) {
      throw Unauthorized('Debes iniciar sesión para continuar.')
    }

    const { whatsappSessionManager } = await import('@/services/whatsapp_session_manager.service')
    const sessions = whatsappSessionManager.getSessionsByClientId(req.authUser.clientId)
    const hasConnected = sessions.some((s) => s.isConnected())

    if (!hasConnected) {
      throw Forbidden('Conecta la sesión de WhatsApp para poder realizar esta acción.')
    }

    next()
  } catch (error) {
    next(error)
  }
}
