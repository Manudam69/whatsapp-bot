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

const clientLogoStorage = multer.diskStorage({
  destination(req, _file, cb) {
    const clientId = req.authUser?.clientId ?? 'unknown'
    const dir = path.resolve(config.PROJECT_ROOT, 'uploads', clientId)
    fs.mkdirSync(dir, { recursive: true })
    cb(null, dir)
  },
  filename(req, file, cb) {
    const decodedOriginalName = Buffer.from(file.originalname, 'latin1').toString('utf8')
    file.originalname = decodedOriginalName
    const sanitized = decodedOriginalName.normalize('NFKD').replace(/[^a-zA-Z0-9._-]/g, '_')
    cb(null, `${Date.now()}-${sanitized}`)
  },
})

export const uploadClientLogoMiddleware = multer({
  storage: clientLogoStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter(req, file, cb) {
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Solo se permiten imágenes.'))
      return
    }
    cb(null, true)
  },
})