import { createSchedule, listSchedules } from '@/controllers/panel_schedules.controller'
import { authenticate, requireAdmin, requireConnectedWhatsappSession } from '@/middlewares/authenticate'

export default {
  GET: [authenticate, listSchedules],
  POST: [authenticate, requireAdmin, requireConnectedWhatsappSession, createSchedule],
} satisfies RestController