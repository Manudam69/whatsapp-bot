import { deleteImage, updateImage } from '@/controllers/panel_images.controller'
import { authenticate } from '@/middlewares/authenticate'

export default {
  PATCH: [authenticate, updateImage],
  DELETE: [authenticate, deleteImage],
} satisfies RestController