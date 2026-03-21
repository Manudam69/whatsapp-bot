import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { validateBody, validateParams } from '../validate'

function makeReqRes(body: unknown = {}, params: unknown = {}) {
  const req = { body, params } as unknown as Request
  const res = {} as Response
  const next = jest.fn() as NextFunction
  return { req, res, next }
}

describe('validateBody', () => {
  const Schema = z.object({ name: z.string().min(1), age: z.number().int().positive() })
  const middleware = validateBody(Schema)

  it('calls next() and sets parsed body on valid input', () => {
    const { req, res, next } = makeReqRes({ name: 'Ana', age: 25 })
    middleware(req, res, next)
    expect(next).toHaveBeenCalledWith()
    expect(req.body).toEqual({ name: 'Ana', age: 25 })
  })

  it('calls next(error) with a 400 HTTPError on invalid input', () => {
    const { req, res, next } = makeReqRes({ name: '', age: -5 })
    middleware(req, res, next)
    const err = (next as jest.Mock).mock.calls[0][0]
    expect(err).toBeDefined()
    expect(err.statusCode).toBe(400)
  })

  it('error message includes the failing field name', () => {
    const { req, res, next } = makeReqRes({ name: 'ok', age: 'not-a-number' })
    middleware(req, res, next)
    const err = (next as jest.Mock).mock.calls[0][0]
    expect(err.message).toMatch(/age/)
  })

  it('replaces body with the Zod-coerced value', () => {
    const CoerceSchema = z.object({ value: z.string().trim().toLowerCase() })
    const { req, res, next } = makeReqRes({ value: '  HELLO  ' })
    validateBody(CoerceSchema)(req, res, next)
    expect(req.body.value).toBe('hello')
  })

  it('does not mutate body on failure', () => {
    const { req, res, next } = makeReqRes({ name: '', age: -1 })
    const original = { ...req.body }
    middleware(req, res, next)
    expect(req.body).toEqual(original)
  })
})

describe('validateParams', () => {
  const Schema = z.object({ id: z.uuid() })
  const middleware = validateParams(Schema)

  it('calls next() on valid UUID param', () => {
    const { req, res, next } = makeReqRes({}, { id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' })
    middleware(req, res, next)
    expect(next).toHaveBeenCalledWith()
  })

  it('calls next(error) with 400 on invalid param', () => {
    const { req, res, next } = makeReqRes({}, { id: 'not-a-uuid' })
    middleware(req, res, next)
    const err = (next as jest.Mock).mock.calls[0][0]
    expect(err.statusCode).toBe(400)
  })
})
