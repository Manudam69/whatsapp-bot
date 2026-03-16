import { createImage, listImages } from '@/controllers/panel_images.controller'
import { authenticate, requireAdmin } from '@/middlewares/authenticate'
import { uploadMediaMiddleware } from '@/utils/uploader'

export default {
  GET: [authenticate, listImages],
  POST: [authenticate, requireAdmin, uploadMediaMiddleware.single('image'), createImage],
} satisfies RestController