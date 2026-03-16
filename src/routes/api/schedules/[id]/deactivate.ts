import { toggleSchedule } from '@/controllers/panel_schedules.controller'
import { authenticate, requireAdmin } from '@/middlewares/authenticate'

export default {
  POST: [authenticate, requireAdmin, toggleSchedule],
} satisfies RestController