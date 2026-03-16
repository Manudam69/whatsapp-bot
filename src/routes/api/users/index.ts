import { createUser, listUsers } from '@/controllers/users.controller'
import { authenticate, requireAdmin, requireConnectedWhatsappSession } from '@/middlewares/authenticate'

export default {
  GET: [authenticate, requireAdmin, listUsers],
  POST: [authenticate, requireAdmin, requireConnectedWhatsappSession, createUser],
} satisfies RestController