import { getSessionQr } from '@/controllers/whatsapp_sessions.controller'
import { authenticate } from '@/middlewares/authenticate'

export default {
  GET: [authenticate, getSessionQr],
} satisfies RestController
