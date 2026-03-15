import fs from 'fs'
import path from 'path'
import multer from 'multer'
import { config } from '@/config'

const uploadDir = path.resolve(process.cwd(), config.MEDIA_UPLOAD_DIR)
fs.mkdirSync(uploadDir, { recursive: true })

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, uploadDir)
  },
  filename(req, file, cb) {
    const sanitized = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')
    cb(null, `${Date.now()}-${sanitized}`)
  },
})

export const uploadMediaMiddleware = multer({ storage })