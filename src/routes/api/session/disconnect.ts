import { disconnectSession } from '@/controllers/panel_session.controller'
import { authenticate, requireAdmin } from '@/middlewares/authenticate'

export default {
  POST: [authenticate, requireAdmin, disconnectSession],
} satisfies RestController