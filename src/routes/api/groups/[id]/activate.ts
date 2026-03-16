import { toggleGroup } from '@/controllers/panel_groups.controller'
import { authenticate, requireAdmin, requireConnectedWhatsappSession } from '@/middlewares/authenticate'

export default {
  POST: [authenticate, requireAdmin, requireConnectedWhatsappSession, toggleGroup],
} satisfies RestController