import { toggleGroup } from '@/controllers/panel_groups.controller'
import { authenticate, requireAdmin } from '@/middlewares/authenticate'

export default {
  POST: [authenticate, requireAdmin, toggleGroup],
} satisfies RestController