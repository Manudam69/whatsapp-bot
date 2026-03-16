import { NextFunction, Request, Response } from 'express'
import { whatsappService } from '@/services/whatsapp.service'
import { groupService } from '@/services/group.service'
import { panelAdminService } from '@/services/panel_admin.service'

export async function listGroups(req: Request, res: Response, next: NextFunction) {
  try {
    if (whatsappService.isConnected()) {
      await whatsappService.syncGroups()
    }

    const groups = await groupService.list()
    res.json(groups.map((group) => panelAdminService.mapGroup(group)))
  } catch (error) {
    next(error)
  }
}

export async function toggleGroup(req: Request, res: Response, next: NextFunction) {
  try {
    const groupId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    const isActive = req.path.endsWith('/activate')
    const group = await groupService.setActive(groupId, isActive)
    res.json(panelAdminService.mapGroup(group))
  } catch (error) {
    next(error)
  }
}