import { NextFunction, Request, Response } from 'express'
import { botConfigurationService } from '@/services/bot_configuration.service'
import { panelAdminService } from '@/services/panel_admin.service'
import { sessionOwnerService } from '@/services/session_owner.service'

export async function getBotSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const ownerPhoneNumber = sessionOwnerService.getActiveOwnerPhoneNumber()
    const settings = ownerPhoneNumber
      ? await botConfigurationService.get(ownerPhoneNumber)
      : botConfigurationService.buildDefaults()
    res.json(panelAdminService.mapBotSettings(settings))
  } catch (error) {
    next(error)
  }
}

export async function updateBotSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const ownerPhoneNumber = sessionOwnerService.requireActiveOwnerPhoneNumber()
    const settings = await botConfigurationService.update(ownerPhoneNumber, req.body ?? {})
    res.json(panelAdminService.mapBotSettings(settings))
  } catch (error) {
    next(error)
  }
}