import { listGroups } from '@/controllers/panel_groups.controller'
import { authenticate } from '@/middlewares/authenticate'

export default {
  GET: [authenticate, listGroups],
} satisfies RestController