import fs from 'fs'
import path from 'path'
import multer from 'multer'
import { config } from '@/config'

const uploadDir = path.resolve(config.PROJECT_ROOT, config.MEDIA_UPLOAD_DIR)
fs.mkdirSync(uploadDir, { recursive: true })

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, uploadDir)
  },
  filename(req, file, cb) {
    const decodedOriginalName = Buffer.from(file.originalname, 'latin1').toString('utf8')
    file.originalname = decodedOriginalName
    const sanitized = decodedOriginalName.normalize('NFKD').replace(/[^a-zA-Z0-9._-]/g, '_')
    cb(null, `${Date.now()}-${sanitized}`)
  },
})

export const uploadMediaMiddleware = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
})