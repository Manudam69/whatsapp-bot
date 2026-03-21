import { updateReport } from '@/controllers/panel_reports.controller'
import { authenticate, requireConnectedWhatsappSession } from '@/middlewares/authenticate'
import { validateBody, validateParams } from '@/middlewares/validate'
import { UpdateReportSchema, UuidParamSchema } from '@/schemas'

export default {
  PATCH: [authenticate, requireConnectedWhatsappSession, validateParams(UuidParamSchema), validateBody(UpdateReportSchema), updateReport],
} satisfies RestController