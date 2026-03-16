import { deleteMessage, updateMessage } from '@/controllers/panel_messages.controller'
import { authenticate } from '@/middlewares/authenticate'

export default {
  PUT: [authenticate, updateMessage],
  DELETE: [authenticate, deleteMessage],
} satisfies RestController