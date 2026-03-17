import { getAntibanStats, controlAntiban } from '@/controllers/panel_session.controller'
import { authenticate } from '@/middlewares/authenticate'

export default {
  GET:  [authenticate, getAntibanStats],
  POST: [authenticate, controlAntiban],
} satisfies RestController
