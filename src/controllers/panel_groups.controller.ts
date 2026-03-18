import { NextFunction, Request, Response } from 'express'
import { In } from 'typeorm'
import { WhatsappGroup } from '@/entities/whatsapp_group.entity'
import { groupService } from '@/services/group.service'
import { panelAdminService } from '@/services/panel_admin.service'
import { whatsappSessionManager } from '@/services/whatsapp_session_manager.service'

export async function listGroups(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = req.authUser!.clientId
    const sessions = whatsappSessionManager.getSessionsByClientId(clientId)
    const sessionIds = sessions.map((s) => s.sessionId)

    // Sync groups for all connected sessions
    await Promise.allSettled(
      sessions
        .filter((s) => s.isConnected())
        .map((s) => s.syncGroups()),
    )

    const groups = sessionIds.length > 0
      ? await WhatsappGroup.find({ where: { sessionId: In(sessionIds), isMember: true }, order: { name: 'ASC' } })
      : []

    res.json(groups.map((group) => panelAdminService.mapGroup(group)))
  } catch (error) {
    next(error)
  }
}

export async function toggleGroup(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = req.authUser!.clientId
    const groupId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    const isActive = req.path.endsWith('/activate')

    // Find the group to know which session it belongs to
    const existing = await WhatsappGroup.findOne({ where: { id: groupId } })
    if (!existing) {
      res.status(404).json({ message: 'Grupo no encontrado.' })
      return
    }

    const group = await groupService.setActive(existing.sessionId, clientId, groupId, isActive)
    res.json(panelAdminService.mapGroup(group))
  } catch (error) {
    next(error)
  }
}
