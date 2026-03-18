import { resetSession } from '@/controllers/whatsapp_sessions.controller'
import { authenticate } from '@/middlewares/authenticate'

export default {
  POST: [authenticate, resetSession],
} satisfies RestController
