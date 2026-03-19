import fs from 'fs'
import path from 'path'
import { Request } from 'express'
import { config } from '@/config'
import { Client } from '@/entities/client.entity'
import { NotFound } from '@/middlewares/error_handler'

type DisplayLogo = {
  fileName: string
  filePath: string
  publicUrl: string
}

export const clientService = {
  async getByClientId(clientId: string) {
    const client = await Client.findOne({ where: { id: clientId } })
    if (!client) {
      throw NotFound('Cliente no encontrado.')
    }
    return client
  },

  mapBranding(req: Request, client: Client) {
    const logo = client.displayLogo as DisplayLogo | null
    let logoUrl: string | null = null
    if (logo?.publicUrl) {
      const protocol = req.protocol
      const host = req.get('host')
      logoUrl = `${protocol}://${host}${logo.publicUrl}`
    }
    return {
      displayName: client.displayName,
      logoUrl,
    }
  },

  async updateDisplayName(clientId: string, displayName: string) {
    const client = await this.getByClientId(clientId)
    client.displayName = displayName.trim()
    await client.save()
    return client
  },

  async updateLogo(clientId: string, file: Express.Multer.File) {
    const client = await this.getByClientId(clientId)

    // Delete old logo file if exists
    const oldLogo = client.displayLogo as DisplayLogo | null
    if (oldLogo?.filePath) {
      const oldAbsPath = path.resolve(config.PROJECT_ROOT, oldLogo.filePath)
      if (fs.existsSync(oldAbsPath)) {
        fs.rmSync(oldAbsPath, { force: true })
      }
    }

    const normalizedPath = `uploads/${clientId}/${file.filename}`.replace(/\\/g, '/')
    client.displayLogo = {
      fileName: file.filename,
      filePath: normalizedPath,
      publicUrl: `/${normalizedPath}`,
    }
    await client.save()
    return client
  },

  async deleteLogo(clientId: string) {
    const client = await this.getByClientId(clientId)
    const logo = client.displayLogo as DisplayLogo | null
    if (logo?.filePath) {
      const absPath = path.resolve(config.PROJECT_ROOT, logo.filePath)
      if (fs.existsSync(absPath)) {
        fs.rmSync(absPath, { force: true })
      }
    }
    client.displayLogo = null
    await client.save()
    return client
  },
}
