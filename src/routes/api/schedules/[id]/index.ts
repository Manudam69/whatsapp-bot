import { deleteSchedule, updateSchedule } from '@/controllers/panel_schedules.controller'
import { authenticate } from '@/middlewares/authenticate'

export default {
  PUT: [authenticate, updateSchedule],
  DELETE: [authenticate, deleteSchedule],
} satisfies RestController