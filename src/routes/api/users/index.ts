import { createUser, listUsers } from '@/controllers/users.controller'
import { authenticate, requireAdmin, requireConnectedWhatsappSession } from '@/middlewares/authenticate'
import { validateBody } from '@/middlewares/validate'
import { CreateUserSchema } from '@/schemas'

export default {
  GET: [authenticate, requireAdmin, listUsers],
  POST: [authenticate, requireAdmin, requireConnectedWhatsappSession, validateBody(CreateUserSchema), createUser],
} satisfies RestController