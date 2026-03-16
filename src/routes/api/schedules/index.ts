import { createSchedule, listSchedules } from '@/controllers/panel_schedules.controller'
import { authenticate } from '@/middlewares/authenticate'

export default {
  GET: [authenticate, listSchedules],
  POST: [authenticate, createSchedule],
} satisfies RestController