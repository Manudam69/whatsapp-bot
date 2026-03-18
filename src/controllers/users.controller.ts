import { NextFunction, Request, Response } from 'express'
import { authService } from '@/services/auth.service'
import { userService } from '@/services/user.service'

export async function listUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = req.authUser!.clientId
    const users = await userService.list(clientId)
    res.json(users.map((user) => authService.sanitizeUser(user)))
  } catch (error) {
    next(error)
  }
}

export async function createUser(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = req.authUser!.clientId
    const user = await userService.create(clientId, req.body ?? {})
    res.status(201).json(authService.sanitizeUser(user))
  } catch (error) {
    next(error)
  }
}

export async function updateUser(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    const user = await userService.update(userId, req.body ?? {}, req.authUser?.id)
    res.json(authService.sanitizeUser(user))
  } catch (error) {
    next(error)
  }
}

export async function deleteUser(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    const result = await userService.remove(userId, req.authUser?.id)
    res.json(result)
  } catch (error) {
    next(error)
  }
}