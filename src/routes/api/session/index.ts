import { getSession } from '@/controllers/panel_session.controller'
import { authenticate } from '@/middlewares/authenticate'

export default {
  GET: [authenticate, getSession],
} satisfies RestController