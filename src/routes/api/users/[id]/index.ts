import { deleteUser, updateUser } from '@/controllers/users.controller'
import { authenticate, requireAdmin } from '@/middlewares/authenticate'

export default {
  PUT: [authenticate, requireAdmin, updateUser],
  DELETE: [authenticate, requireAdmin, deleteUser],
} satisfies RestController