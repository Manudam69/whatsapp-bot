import { toggleGroup } from '@/controllers/panel_groups.controller'
import { authenticate } from '@/middlewares/authenticate'

export default {
  POST: [authenticate, toggleGroup],
} satisfies RestController