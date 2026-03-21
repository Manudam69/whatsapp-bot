import { randomUUID } from 'crypto'
import { NextFunction, Request, Response } from 'express'
import { requestContextStorage } from '@/utils/request_context'

export function requestId(req: Request, res: Response, next: NextFunction) {
  const id = (req.headers['x-request-id'] as string) || randomUUID()
  req.requestId = id
  res.setHeader('x-request-id', id)
  requestContextStorage.run({ requestId: id }, next)
}
