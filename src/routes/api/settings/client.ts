import { getClientSettings, updateClientSettings } from '@/controllers/panel_client.controller'
import { authenticate, requireAdmin } from '@/middlewares/authenticate'
import { uploadClientLogoMiddleware } from '@/utils/uploader'

export default {
  GET: [authenticate, getClientSettings],
  PUT: [authenticate, requireAdmin, uploadClientLogoMiddleware.single('logo'), updateClientSettings],
} satisfies RestController
