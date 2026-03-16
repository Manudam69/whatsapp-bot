import { createMediaAsset, listMediaAssets } from '@/controllers/media_assets.controller'
import { authenticate, requireAdmin } from '@/middlewares/authenticate'
import { uploadMediaMiddleware } from '@/utils/uploader'

export default {
  GET: [authenticate, listMediaAssets],
  POST: [authenticate, requireAdmin, uploadMediaMiddleware.single('file'), createMediaAsset],
} satisfies RestController