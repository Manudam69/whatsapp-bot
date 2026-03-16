import { updateMediaAsset } from '@/controllers/media_assets.controller'
import { authenticate, requireAdmin } from '@/middlewares/authenticate'

export default {
  PATCH: [authenticate, requireAdmin, updateMediaAsset],
} satisfies RestController