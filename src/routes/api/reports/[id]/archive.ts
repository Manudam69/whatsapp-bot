import { archiveReport } from '@/controllers/panel_reports.controller'
import { authenticate, requireAdminOrAgent } from '@/middlewares/authenticate'
import { validateBody, validateParams } from '@/middlewares/validate'
import { ArchiveReportSchema, UuidParamSchema } from '@/schemas'

export default {
  PATCH: [authenticate, requireAdminOrAgent, validateParams(UuidParamSchema), validateBody(ArchiveReportSchema), archiveReport],
} satisfies RestController
