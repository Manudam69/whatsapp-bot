import { NextFunction, Request, Response } from 'express'
import { BadRequest } from '@/middlewares/error_handler'
import { mediaAssetService } from '@/services/media_asset.service'
import { panelAdminService } from '@/services/panel_admin.service'
import { sseService } from '@/services/sse.service'

export async function listImages(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = req.authUser!.clientId
    const assets = await mediaAssetService.list(clientId)
    res.json(assets.map((asset) => panelAdminService.mapImage(req, asset)))
  } catch (error) {
    next(error)
  }
}

export async function createImage(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = req.authUser!.clientId
    if (!req.file) {
      throw BadRequest('Debes adjuntar una imagen.')
    }

    const asset = await mediaAssetService.create(clientId, {
      name: String(req.body?.name || req.file.originalname),
      category: String(req.body?.category || ''),
      fileName: req.file.filename,
      filePath: `uploads/media/${req.file.filename}`,
      mimeType: req.file.mimetype,
    })

    const created = panelAdminService.mapImage(req, asset)
    sseService.emit(clientId, 'image:created', created)
    res.status(201).json(created)
  } catch (error) {
    next(error)
  }
}

export async function deleteImage(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = req.authUser!.clientId
    const imageId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    const result = await mediaAssetService.remove(clientId, imageId)
    sseService.emit(clientId, 'image:deleted', { id: imageId })
    res.json(result)
  } catch (error) {
    next(error)
  }
}

export async function updateImage(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = req.authUser!.clientId
    const imageId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    const asset = await mediaAssetService.update(clientId, imageId, {
      name: req.body?.name,
    })

    const updated = panelAdminService.mapImage(req, asset)
    sseService.emit(clientId, 'image:updated', updated)
    res.json(updated)
  } catch (error) {
    next(error)
  }
}