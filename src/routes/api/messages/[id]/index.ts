import { deleteMessage, updateMessage } from '@/controllers/panel_messages.controller'
import { authenticate, requireAdmin, requireConnectedWhatsappSession } from '@/middlewares/authenticate'

export default {
  PUT: [authenticate, requireAdmin, requireConnectedWhatsappSession, updateMessage],
  DELETE: [authenticate, requireAdmin, requireConnectedWhatsappSession, deleteMessage],
} satisfies RestController