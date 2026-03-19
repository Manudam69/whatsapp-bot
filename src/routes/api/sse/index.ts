import { Request, Response } from 'express'
import { authService } from '@/services/auth.service'
import { sseService } from '@/services/sse.service'

async function handleSse(req: Request, res: Response) {
  const token = typeof req.query.token === 'string' ? req.query.token : ''

  if (!token) {
    res.status(401).json({ message: 'Token requerido' })
    return
  }

  let clientId: string
  try {
    const authUser = await authService.verifyToken(token)
    clientId = authUser.clientId
  } catch {
    res.status(401).json({ message: 'Token inválido o expirado' })
    return
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  sseService.addClient(clientId, res)
  res.write(`event: connected\ndata: ${JSON.stringify({ ok: true })}\n\n`)

  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n')
    } catch {
      clearInterval(heartbeat)
    }
  }, 30_000)

  req.on('close', () => {
    clearInterval(heartbeat)
    sseService.removeClient(clientId, res)
  })
}

export default {
  GET: handleSse,
} satisfies RestController
