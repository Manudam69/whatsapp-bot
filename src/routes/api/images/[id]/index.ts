import { deleteImage, updateImage } from '@/controllers/panel_images.controller'
import { authenticate, requireAdmin, requireConnectedWhatsappSession } from '@/middlewares/authenticate'

export default {
  PATCH: [authenticate, requireAdmin, requireConnectedWhatsappSession, updateImage],
  DELETE: [authenticate, requireAdmin, requireConnectedWhatsappSession, deleteImage],
} satisfies RestController