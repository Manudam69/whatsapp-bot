import { createSchedule, listSchedules } from '@/controllers/panel_schedules.controller'
import { authenticate, requireAdmin } from '@/middlewares/authenticate'

export default {
  GET: [authenticate, listSchedules],
  POST: [authenticate, requireAdmin, createSchedule],
} satisfies RestController