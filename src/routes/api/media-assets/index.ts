import { createMediaAsset, listMediaAssets } from '@/controllers/media_assets.controller'
import { uploadMediaMiddleware } from '@/utils/uploader'

export default {
  GET: listMediaAssets,
  POST: [uploadMediaMiddleware.single('file'), createMediaAsset],
} satisfies RestController