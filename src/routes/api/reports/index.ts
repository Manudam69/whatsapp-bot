import { listReports } from '@/controllers/panel_reports.controller'
import { authenticate } from '@/middlewares/authenticate'

export default {
  GET: [authenticate, listReports],
} satisfies RestController