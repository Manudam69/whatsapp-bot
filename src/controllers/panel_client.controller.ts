import { NextFunction, Request, Response } from 'express'
import { BadRequest } from '@/middlewares/error_handler'
import { clientService } from '@/services/client.service'

export async function getClientSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = req.authUser!.clientId
    const client = await clientService.getByClientId(clientId)
    res.json(clientService.mapBranding(req, client))
  } catch (error) {
    next(error)
  }
}

export async function updateClientSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = req.authUser!.clientId
    const displayName = typeof req.body?.displayName === 'string' ? req.body.displayName.trim() : ''

    if (!displayName && !req.file) {
      throw BadRequest('Debes proporcionar al menos el nombre o un logo.')
    }

    if (displayName) {
      await clientService.updateDisplayName(clientId, displayName)
    }

    if (req.file) {
      await clientService.updateLogo(clientId, req.file)
    }

    const client = await clientService.getByClientId(clientId)
    res.json(clientService.mapBranding(req, client))
  } catch (error) {
    next(error)
  }
}

export async function deleteClientLogo(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = req.authUser!.clientId
    const client = await clientService.deleteLogo(clientId)
    res.json(clientService.mapBranding(req, client))
  } catch (error) {
    next(error)
  }
}
