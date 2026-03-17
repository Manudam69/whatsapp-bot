import { archiveReport } from '@/controllers/panel_reports.controller'
import { authenticate, requireAdmin } from '@/middlewares/authenticate'

export default {
  PATCH: [authenticate, requireAdmin, archiveReport],
} satisfies RestController
