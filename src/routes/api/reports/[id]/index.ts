import { updateReport } from '@/controllers/panel_reports.controller'
import { authenticate, requireAdmin, requireConnectedWhatsappSession } from '@/middlewares/authenticate'

export default {
  PATCH: [authenticate, requireAdmin, requireConnectedWhatsappSession, updateReport],
} satisfies RestController