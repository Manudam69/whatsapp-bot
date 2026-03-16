import { deleteImage } from '@/controllers/panel_images.controller'
import { authenticate } from '@/middlewares/authenticate'

export default {
  DELETE: [authenticate, deleteImage],
} satisfies RestController