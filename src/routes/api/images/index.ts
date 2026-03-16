import { createImage, listImages } from '@/controllers/panel_images.controller'
import { authenticate } from '@/middlewares/authenticate'
import { uploadMediaMiddleware } from '@/utils/uploader'

export default {
  GET: [authenticate, listImages],
  POST: [authenticate, uploadMediaMiddleware.single('image'), createImage],
} satisfies RestController