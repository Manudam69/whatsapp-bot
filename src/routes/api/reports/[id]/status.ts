import { updateReport } from '@/controllers/panel_reports.controller'
import { authenticate } from '@/middlewares/authenticate'

export default {
  PATCH: [authenticate, updateReport],
} satisfies RestController