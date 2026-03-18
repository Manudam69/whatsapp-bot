import { updateClient } from '@/controllers/clients.controller'
import { authenticate, requireAdmin } from '@/middlewares/authenticate'

export default {
  PUT: [authenticate, requireAdmin, updateClient],
} satisfies RestController
