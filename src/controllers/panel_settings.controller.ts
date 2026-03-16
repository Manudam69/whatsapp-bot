import { NextFunction, Request, Response } from 'express'
import { botConfigurationService } from '@/services/bot_configuration.service'
import { panelAdminService } from '@/services/panel_admin.service'

export async function getBotSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const settings = await botConfigurationService.get()
    res.json(panelAdminService.mapBotSettings(settings))
  } catch (error) {
    next(error)
  }
}

export async function updateBotSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const settings = await botConfigurationService.update(req.body ?? {})
    res.json(panelAdminService.mapBotSettings(settings))
  } catch (error) {
    next(error)
  }
}