import { deleteImage, updateImage } from '@/controllers/panel_images.controller'
import { authenticate, requireAdmin } from '@/middlewares/authenticate'

export default {
  PATCH: [authenticate, requireAdmin, updateImage],
  DELETE: [authenticate, requireAdmin, deleteImage],
} satisfies RestController