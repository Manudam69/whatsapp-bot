import { NextFunction, Request, Response } from 'express'
import { BadRequest } from '@/middlewares/error_handler'
import { mediaAssetService } from '@/services/media_asset.service'
import { panelAdminService } from '@/services/panel_admin.service'
import { sessionOwnerService } from '@/services/session_owner.service'

export async function listImages(req: Request, res: Response, next: NextFunction) {
  try {
    const ownerPhoneNumber = sessionOwnerService.getActiveOwnerPhoneNumber()
    if (!ownerPhoneNumber) {
      res.json([])
      return
    }

    const assets = await mediaAssetService.list(ownerPhoneNumber)
    res.json(assets.map((asset) => panelAdminService.mapImage(req, asset)))
  } catch (error) {
    next(error)
  }
}

export async function createImage(req: Request, res: Response, next: NextFunction) {
  try {
    const ownerPhoneNumber = sessionOwnerService.requireActiveOwnerPhoneNumber()
    if (!req.file) {
      throw BadRequest('Debes adjuntar una imagen.')
    }

    const asset = await mediaAssetService.create(ownerPhoneNumber, {
      name: String(req.body?.name || req.file.originalname),
      category: String(req.body?.category || ''),
      fileName: req.file.filename,
      filePath: `uploads/media/${req.file.filename}`,
      mimeType: req.file.mimetype,
    })

    res.status(201).json(panelAdminService.mapImage(req, asset))
  } catch (error) {
    next(error)
  }
}

export async function deleteImage(req: Request, res: Response, next: NextFunction) {
  try {
    const ownerPhoneNumber = sessionOwnerService.requireActiveOwnerPhoneNumber()
    const imageId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    res.json(await mediaAssetService.remove(ownerPhoneNumber, imageId))
  } catch (error) {
    next(error)
  }
}

export async function updateImage(req: Request, res: Response, next: NextFunction) {
  try {
    const ownerPhoneNumber = sessionOwnerService.requireActiveOwnerPhoneNumber()
    const imageId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    const asset = await mediaAssetService.update(ownerPhoneNumber, imageId, {
      name: req.body?.name,
    })

    res.json(panelAdminService.mapImage(req, asset))
  } catch (error) {
    next(error)
  }
}