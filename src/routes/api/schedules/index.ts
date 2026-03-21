import { createSchedule, listSchedules } from '@/controllers/panel_schedules.controller'
import { authenticate, requireAdmin, requireConnectedWhatsappSession } from '@/middlewares/authenticate'
import { validateBody } from '@/middlewares/validate'
import { CreateScheduleSchema } from '@/schemas'

export default {
  GET: [authenticate, listSchedules],
  POST: [authenticate, requireAdmin, requireConnectedWhatsappSession, validateBody(CreateScheduleSchema), createSchedule],
} satisfies RestController