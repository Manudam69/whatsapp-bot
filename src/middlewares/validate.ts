import { NextFunction, Request, Response } from 'express'
import { ZodSchema, ZodError } from 'zod'
import { BadRequest } from './error_handler'

function formatZodError(error: ZodError<unknown>): string {
  return error.issues
    .map((e) => {
      const path = e.path.length > 0 ? `${e.path.join('.')}: ` : ''
      return `${path}${e.message}`
    })
    .join(', ')
}

/** Validates req.body against a Zod schema. Replaces body with the parsed (coerced) value. */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      return next(BadRequest(formatZodError(result.error)))
    }
    req.body = result.data
    next()
  }
}

/** Validates req.params against a Zod schema. */
export function validateParams<T extends Record<string, string>>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.params)
    if (!result.success) {
      return next(BadRequest(formatZodError(result.error)))
    }
    req.params = result.data as Record<string, string>
    next()
  }
}
