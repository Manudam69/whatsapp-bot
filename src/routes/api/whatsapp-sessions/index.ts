import { listSessions, createSession } from '@/controllers/whatsapp_sessions.controller'
import { authenticate, requireAdmin } from '@/middlewares/authenticate'

export default {
  GET: [authenticate, listSessions],
  POST: [authenticate, requireAdmin, createSession],
} satisfies RestController
