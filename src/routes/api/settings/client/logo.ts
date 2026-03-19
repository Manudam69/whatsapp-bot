import { deleteClientLogo } from '@/controllers/panel_client.controller'
import { authenticate, requireAdmin } from '@/middlewares/authenticate'

export default {
  DELETE: [authenticate, requireAdmin, deleteClientLogo],
} satisfies RestController
