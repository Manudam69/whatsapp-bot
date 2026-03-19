import { recoverPendingConversations } from '@/controllers/panel_conversations.controller'
import { authenticate, requireAdmin, requireConnectedWhatsappSession } from '@/middlewares/authenticate'

export default {
  POST: [authenticate, requireAdmin, requireConnectedWhatsappSession, recoverPendingConversations],
} satisfies RestController