import { getDashboardOverview } from '@/controllers/panel_dashboard.controller'
import { authenticate } from '@/middlewares/authenticate'

export default {
  GET: [authenticate, getDashboardOverview],
} satisfies RestController