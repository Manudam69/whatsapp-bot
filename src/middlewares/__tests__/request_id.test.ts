import { Request, Response, NextFunction } from 'express'
import { requestId } from '../request_id'
import { getRequestId } from '@/utils/request_context'

function makeReqRes(headers: Record<string, string> = {}) {
  const req = { headers } as unknown as Request
  const setHeader = jest.fn()
  const res = { setHeader } as unknown as Response
  const next = jest.fn() as NextFunction
  return { req, res, next, setHeader }
}

describe('requestId middleware', () => {
  it('generates a UUID when x-request-id header is absent', () => {
    const { req, res, next } = makeReqRes()
    requestId(req, res, next)
    expect(req.requestId).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('uses the incoming x-request-id header value', () => {
    const { req, res, next } = makeReqRes({ 'x-request-id': 'custom-id-123' })
    requestId(req, res, next)
    expect(req.requestId).toBe('custom-id-123')
  })

  it('sets the x-request-id response header', () => {
    const { req, res, next, setHeader } = makeReqRes()
    requestId(req, res, next)
    expect(setHeader).toHaveBeenCalledWith('x-request-id', req.requestId)
  })

  it('calls next()', () => {
    const { req, res, next } = makeReqRes()
    requestId(req, res, next)
    expect(next).toHaveBeenCalled()
  })

  it('makes requestId available in AsyncLocalStorage context inside next()', (done) => {
    const { req, res } = makeReqRes()
    const next: NextFunction = () => {
      // This runs inside the AsyncLocalStorage context
      expect(getRequestId()).toBe(req.requestId)
      done()
    }
    requestId(req, res, next)
  })

  it('each request gets a different UUID', () => {
    const { req: req1, res: res1, next: next1 } = makeReqRes()
    const { req: req2, res: res2, next: next2 } = makeReqRes()
    requestId(req1, res1, next1)
    requestId(req2, res2, next2)
    expect(req1.requestId).not.toBe(req2.requestId)
  })
})
