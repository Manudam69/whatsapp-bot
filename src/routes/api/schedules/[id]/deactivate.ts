import { toggleSchedule } from '@/controllers/panel_schedules.controller'
import { authenticate, requireAdmin, requireConnectedWhatsappSession } from '@/middlewares/authenticate'

export default {
  POST: [authenticate, requireAdmin, requireConnectedWhatsappSession, toggleSchedule],
} satisfies RestController