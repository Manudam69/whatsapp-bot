import { NextFunction, Request, Response } from 'express'
import { BadRequest } from '@/middlewares/error_handler'
import { mediaAssetService } from '@/services/media_asset.service'

export async function listMediaAssets(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = req.authUser!.clientId
    const assets = await mediaAssetService.list(clientId)
    res.json(assets)
  } catch (error) {
    next(error)
  }
}

export async function createMediaAsset(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = req.authUser!.clientId
    if (!req.file) {
      throw BadRequest('Debes adjuntar una imagen.')
    }

    const asset = await mediaAssetService.create(clientId, {
      name: String(req.body.name || req.file.originalname),
      category: req.body.category,
      fileName: req.file.filename,
      filePath: `uploads/media/${req.file.filename}`,
      mimeType: req.file.mimetype,
    })

    res.status(201).json(asset)
  } catch (error) {
    next(error)
  }
}

export async function updateMediaAsset(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = req.authUser!.clientId
    const assetId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    const asset = await mediaAssetService.update(clientId, assetId, {
      name: req.body.name,
      category: req.body.category,
      isActive: req.body.isActive,
    })

    res.json(asset)
  } catch (error) {
    next(error)
  }
}