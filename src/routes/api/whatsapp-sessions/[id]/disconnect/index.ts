import { disconnectSession } from '@/controllers/whatsapp_sessions.controller'
import { authenticate } from '@/middlewares/authenticate'

export default {
  POST: [authenticate, disconnectSession],
} satisfies RestController
