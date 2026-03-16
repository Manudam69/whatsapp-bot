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

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    const token = getBearerToken(req)
    req.authUser = await authService.verifyToken(token)
    next()
  } catch (error) {
    next(error)
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
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