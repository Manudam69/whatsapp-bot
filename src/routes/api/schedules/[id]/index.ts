import { deleteSchedule, updateSchedule } from '@/controllers/panel_schedules.controller'
import { authenticate, requireAdmin, requireConnectedWhatsappSession } from '@/middlewares/authenticate'

export default {
  PUT: [authenticate, requireAdmin, requireConnectedWhatsappSession, updateSchedule],
  DELETE: [authenticate, requireAdmin, requireConnectedWhatsappSession, deleteSchedule],
} satisfies RestController