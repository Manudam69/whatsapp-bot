import { NextFunction, Request, Response } from 'express'
import { whatsappService } from '@/services/whatsapp.service'
import { groupService } from '@/services/group.service'
import { panelAdminService } from '@/services/panel_admin.service'
import { sessionOwnerService } from '@/services/session_owner.service'

export async function listGroups(req: Request, res: Response, next: NextFunction) {
  try {
    const ownerPhoneNumber = sessionOwnerService.getActiveOwnerPhoneNumber()
    if (!ownerPhoneNumber) {
      res.json([])
      return
    }

    if (whatsappService.isConnected()) {
      await whatsappService.syncGroups()
    }

    const groups = await groupService.list(ownerPhoneNumber)
    res.json(groups.map((group) => panelAdminService.mapGroup(group)))
  } catch (error) {
    next(error)
  }
}

export async function toggleGroup(req: Request, res: Response, next: NextFunction) {
  try {
    const ownerPhoneNumber = sessionOwnerService.requireActiveOwnerPhoneNumber()
    const groupId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    const isActive = req.path.endsWith('/activate')
    const group = await groupService.setActive(ownerPhoneNumber, groupId, isActive)
    res.json(panelAdminService.mapGroup(group))
  } catch (error) {
    next(error)
  }
}