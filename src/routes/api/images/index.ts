import { createImage, listImages } from '@/controllers/panel_images.controller'
import { authenticate, requireAdmin, requireConnectedWhatsappSession } from '@/middlewares/authenticate'
import { uploadMediaMiddleware } from '@/utils/uploader'

export default {
  GET: [authenticate, listImages],
  POST: [authenticate, requireAdmin, requireConnectedWhatsappSession, uploadMediaMiddleware.single('image'), createImage],
} satisfies RestController