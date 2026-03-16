import { updateReport } from '@/controllers/panel_reports.controller'
import { authenticate, requireConnectedWhatsappSession } from '@/middlewares/authenticate'

export default {
  PATCH: [authenticate, requireConnectedWhatsappSession, updateReport],
} satisfies RestController