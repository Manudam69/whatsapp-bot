import { createMessage, listMessages } from '@/controllers/panel_messages.controller'
import { authenticate, requireAdmin } from '@/middlewares/authenticate'

export default {
  GET: [authenticate, listMessages],
  POST: [authenticate, requireAdmin, createMessage],
} satisfies RestController