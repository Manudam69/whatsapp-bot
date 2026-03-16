import { createMessage, listMessages } from '@/controllers/panel_messages.controller'
import { authenticate } from '@/middlewares/authenticate'

export default {
  GET: [authenticate, listMessages],
  POST: [authenticate, createMessage],
} satisfies RestController