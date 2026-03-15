import { NextFunction, Request, Response } from 'express'
import logger from '@/utils/logger'

class HTTPError extends Error {
  statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.statusCode = statusCode
    this.name = 'HTTPError'
  }
}

export const BadRequest = (message: string = 'Bad Request') => new HTTPError(400, message)
export const NotFound = (message: string = 'Not Found') => new HTTPError(404, message)
export const Conflict = (message: string = 'Conflict') => new HTTPError(409, message)
export const InternalServerError = (message: string = 'Internal Server Error') => new HTTPError(500, message)

export default function handleErrorMiddleware(err: HTTPError | Error, req: Request, res: Response, next: NextFunction) {
  if (err instanceof HTTPError) {
    logger.error(`Error ${err.statusCode}: ${err.message}`)
    res.status(err.statusCode).json({
      statusCode: err.statusCode,
      message: err.message,
    })
    return
  }

  logger.error(`Unexpected server error: ${err instanceof Error ? err.stack || err.message : String(err)}`)
  res.status(500).json({
    statusCode: 500,
    message: 'Internal Server Error',
  })
}