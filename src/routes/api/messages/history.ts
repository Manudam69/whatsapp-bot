import { listMessageHistory } from '@/controllers/panel_messages.controller'
import { authenticate } from '@/middlewares/authenticate'

export default {
  GET: [authenticate, listMessageHistory],
} satisfies RestController