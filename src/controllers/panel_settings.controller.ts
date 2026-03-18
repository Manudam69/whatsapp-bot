import { NextFunction, Request, Response } from 'express'
import { botConfigurationService } from '@/services/bot_configuration.service'
import { panelAdminService } from '@/services/panel_admin.service'
import { whatsappSessionManager } from '@/services/whatsapp_session_manager.service'

function getFirstSessionId(clientId: string): string | undefined {
  const sessions = whatsappSessionManager.getSessionsByClientId(clientId)
  const connected = sessions.find((s) => s.isConnected())
  return (connected ?? sessions[0])?.sessionId
}

export async function getBotSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = req.authUser!.clientId
    const sessionId = getFirstSessionId(clientId)
    const settings = await botConfigurationService.get(clientId, sessionId)
    res.json(panelAdminService.mapBotSettings(settings))
  } catch (error) {
    next(error)
  }
}

export async function updateBotSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = req.authUser!.clientId
    const sessionId = getFirstSessionId(clientId) ?? ''
    const settings = await botConfigurationService.update(clientId, sessionId, req.body ?? {})
    res.json(panelAdminService.mapBotSettings(settings))
  } catch (error) {
    next(error)
  }
}