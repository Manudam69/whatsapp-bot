import fs from 'fs'
import path from 'path'
import { AppDataSource } from '@/database/datasource'
import { config } from '@/config'
import { BadRequest, NotFound } from '@/middlewares/error_handler'
import { MediaAsset } from '@/entities/media_asset.entity'

export type MediaAssetInput = {
  name: string
  category?: string
  fileName: string
  filePath: string
  mimeType: string
}

export const mediaAssetService = {
  async create(input: MediaAssetInput) {
    if (!input.name.trim()) {
      throw BadRequest('El nombre del recurso es obligatorio.')
    }

    const normalizedPath = input.filePath.replace(/\\/g, '/')

    return MediaAsset.save({
      name: input.name.trim(),
      category: input.category?.trim(),
      fileName: input.fileName,
      filePath: normalizedPath,
      mimeType: input.mimeType,
      publicUrl: '/' + normalizedPath.replace(/^\/+/, ''),
    })
  },

  async list() {
    return MediaAsset.find({ order: { createdAt: 'DESC' } })
  },

  async update(id: string, payload: Partial<Pick<MediaAsset, 'name' | 'category' | 'isActive'>>) {
    const asset = await MediaAsset.findOne({ where: { id } })
    if (!asset) {
      throw NotFound('Recurso multimedia no encontrado.')
    }

    if (payload.name !== undefined) {
      asset.name = payload.name.trim()
    }
    if (payload.category !== undefined) {
      asset.category = payload.category?.trim()
    }
    if (payload.isActive !== undefined) {
      asset.isActive = payload.isActive
    }

    await asset.save()
    return asset
  },

  async findById(id: string) {
    const asset = await MediaAsset.findOne({ where: { id } })
    if (!asset) {
      throw NotFound('Recurso multimedia no encontrado.')
    }
    return asset
  },

  async remove(id: string) {
    const asset = await this.findById(id)

    await AppDataSource.query('UPDATE auto_messages SET image_id = NULL WHERE image_id = $1', [asset.id])
    await AppDataSource.query('UPDATE notification_schedules SET media_asset_id = NULL WHERE media_asset_id = $1', [asset.id])

    const absolutePath = path.resolve(config.PROJECT_ROOT, asset.filePath)
    await asset.remove()

    if (fs.existsSync(absolutePath)) {
      fs.rmSync(absolutePath, { force: true })
    }

    return { success: true }
  },
}