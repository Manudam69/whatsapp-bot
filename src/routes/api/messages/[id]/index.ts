import { deleteMessage, updateMessage } from '@/controllers/panel_messages.controller'
import { authenticate, requireAdmin } from '@/middlewares/authenticate'

export default {
  PUT: [authenticate, requireAdmin, updateMessage],
  DELETE: [authenticate, requireAdmin, deleteMessage],
} satisfies RestController