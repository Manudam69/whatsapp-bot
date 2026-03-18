import { getSessionById, deleteSession } from '@/controllers/whatsapp_sessions.controller'
import { authenticate } from '@/middlewares/authenticate'

export default {
  GET: [authenticate, getSessionById],
  DELETE: [authenticate, deleteSession],
} satisfies RestController
