import { deleteSchedule, updateSchedule } from '@/controllers/panel_schedules.controller'
import { authenticate, requireAdmin, requireConnectedWhatsappSession } from '@/middlewares/authenticate'
import { validateBody, validateParams } from '@/middlewares/validate'
import { UpdateScheduleSchema, UuidParamSchema } from '@/schemas'

export default {
  PUT: [authenticate, requireAdmin, requireConnectedWhatsappSession, validateParams(UuidParamSchema), validateBody(UpdateScheduleSchema), updateSchedule],
  DELETE: [authenticate, requireAdmin, requireConnectedWhatsappSession, validateParams(UuidParamSchema), deleteSchedule],
} satisfies RestController