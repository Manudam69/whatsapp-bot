import { NextFunction, Request, Response } from 'express'
import { Unauthorized } from '@/middlewares/error_handler'
import { authService } from '@/services/auth.service'

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email : ''
    const password = typeof req.body?.password === 'string' ? req.body.password : ''

    const session = await authService.login(email, password)
    res.json(session)
  } catch (error) {
    next(error)
  }
}

export async function changePassword(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.authUser) {
      throw Unauthorized('Debes iniciar sesión para continuar.')
    }

    const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : ''
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : ''

    const result = await authService.changePassword(req.authUser, currentPassword, newPassword)
    res.json(result)
  } catch (error) {
    next(error)
  }
}