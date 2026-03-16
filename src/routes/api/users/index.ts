import { createUser, listUsers } from '@/controllers/users.controller'
import { authenticate, requireAdmin } from '@/middlewares/authenticate'

export default {
  GET: [authenticate, requireAdmin, listUsers],
  POST: [authenticate, requireAdmin, createUser],
} satisfies RestController