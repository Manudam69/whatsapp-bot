import { toggleSchedule } from '@/controllers/panel_schedules.controller'
import { authenticate } from '@/middlewares/authenticate'

export default {
  POST: [authenticate, toggleSchedule],
} satisfies RestController