import { authenticate, requireAdmin } from '@/middlewares/authenticate'
import { getDispatchHistory, deleteDispatchBatch } from '@/controllers/panel_schedules.controller'

export default {
  GET: [authenticate, getDispatchHistory],
  DELETE: [authenticate, requireAdmin, deleteDispatchBatch],
} satisfies RestController