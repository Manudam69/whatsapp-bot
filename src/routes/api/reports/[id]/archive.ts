import { archiveReport } from '@/controllers/panel_reports.controller'
import { authenticate, requireAdminOrAgent } from '@/middlewares/authenticate'

export default {
  PATCH: [authenticate, requireAdminOrAgent, archiveReport],
} satisfies RestController
