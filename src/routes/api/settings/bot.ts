import { getBotSettings, updateBotSettings } from '@/controllers/panel_settings.controller'
import { authenticate, requireAdmin } from '@/middlewares/authenticate'

export default {
  GET: [authenticate, getBotSettings],
  PUT: [authenticate, requireAdmin, updateBotSettings],
} satisfies RestController