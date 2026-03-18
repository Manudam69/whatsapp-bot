import { listClients, createClient } from '@/controllers/clients.controller'
import { authenticate, requireAdmin } from '@/middlewares/authenticate'

export default {
  GET: [authenticate, requireAdmin, listClients],
  POST: [authenticate, requireAdmin, createClient],
} satisfies RestController
