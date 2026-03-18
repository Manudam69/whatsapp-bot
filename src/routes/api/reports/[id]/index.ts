import { updateReport } from '@/controllers/panel_reports.controller'
import { authenticate, requireAdminOrAgent, requireConnectedWhatsappSession } from '@/middlewares/authenticate'

export default {
  PATCH: [authenticate, requireAdminOrAgent, requireConnectedWhatsappSession, updateReport],
} satisfies RestController