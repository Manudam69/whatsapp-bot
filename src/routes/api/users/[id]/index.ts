import { deleteUser, updateUser } from '@/controllers/users.controller'
import { authenticate, requireAdmin, requireConnectedWhatsappSession } from '@/middlewares/authenticate'

export default {
  PUT: [authenticate, requireAdmin, requireConnectedWhatsappSession, updateUser],
  DELETE: [authenticate, requireAdmin, requireConnectedWhatsappSession, deleteUser],
} satisfies RestController