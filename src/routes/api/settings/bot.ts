import { getBotSettings, updateBotSettings } from '@/controllers/panel_settings.controller'
import { authenticate } from '@/middlewares/authenticate'

export default {
  GET: [authenticate, getBotSettings],
  PUT: [authenticate, updateBotSettings],
} satisfies RestController