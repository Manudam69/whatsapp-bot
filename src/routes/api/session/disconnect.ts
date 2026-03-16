import { disconnectSession } from '@/controllers/panel_session.controller'
import { authenticate } from '@/middlewares/authenticate'

export default {
  POST: [authenticate, disconnectSession],
} satisfies RestController