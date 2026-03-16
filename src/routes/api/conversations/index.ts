import { listConversations } from '@/controllers/panel_conversations.controller'
import { authenticate } from '@/middlewares/authenticate'

export default {
  GET: [authenticate, listConversations],
} satisfies RestController