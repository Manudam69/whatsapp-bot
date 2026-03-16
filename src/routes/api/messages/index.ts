import { createMessage, listMessages } from '@/controllers/panel_messages.controller'
import { authenticate, requireAdmin, requireConnectedWhatsappSession } from '@/middlewares/authenticate'

export default {
  GET: [authenticate, listMessages],
  POST: [authenticate, requireAdmin, requireConnectedWhatsappSession, createMessage],
} satisfies RestController