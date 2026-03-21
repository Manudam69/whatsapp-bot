import { deleteUser, updateUser } from '@/controllers/users.controller'
import { authenticate, requireAdmin, requireConnectedWhatsappSession } from '@/middlewares/authenticate'
import { validateBody, validateParams } from '@/middlewares/validate'
import { UpdateUserSchema, UuidParamSchema } from '@/schemas'

export default {
  PUT: [authenticate, requireAdmin, requireConnectedWhatsappSession, validateParams(UuidParamSchema), validateBody(UpdateUserSchema), updateUser],
  DELETE: [authenticate, requireAdmin, requireConnectedWhatsappSession, validateParams(UuidParamSchema), deleteUser],
} satisfies RestController