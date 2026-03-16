import { deleteSchedule, updateSchedule } from '@/controllers/panel_schedules.controller'
import { authenticate, requireAdmin } from '@/middlewares/authenticate'

export default {
  PUT: [authenticate, requireAdmin, updateSchedule],
  DELETE: [authenticate, requireAdmin, deleteSchedule],
} satisfies RestController