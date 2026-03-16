import { getBotSettings, updateBotSettings } from '@/controllers/panel_settings.controller'
import { authenticate, requireAdmin, requireConnectedWhatsappSession } from '@/middlewares/authenticate'

export default {
  GET: [authenticate, getBotSettings],
  PUT: [authenticate, requireAdmin, requireConnectedWhatsappSession, updateBotSettings],
} satisfies RestController