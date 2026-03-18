import { authenticate, requireAdmin } from '@/middlewares/authenticate'
import { deleteDispatch } from '@/controllers/panel_schedules.controller'

export default {
  DELETE: [authenticate, requireAdmin, deleteDispatch],
} satisfies RestController
