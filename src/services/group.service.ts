import { AutoMessage } from '@/entities/auto_message.entity'
import { BotConfiguration } from '@/entities/bot_configuration.entity'
import { NotificationSchedule } from '@/entities/notification_schedule.entity'
import { WhatsappGroup } from '@/entities/whatsapp_group.entity'

type ResolveGroupOptions = {
  activeOnly?: boolean
}

export const groupService = {
  async upsertGroups(ownerPhoneNumber: string, groups: Array<{ jid: string; name: string; participantCount: number }>) {
    const now = new Date()
    const incomingJids = new Set(groups.map((group) => group.jid))

    if (groups.length > 0) {
      await WhatsappGroup.createQueryBuilder()
        .update()
        .set({ isMember: false })
        .where('owner_phone_number = :ownerPhoneNumber', { ownerPhoneNumber })
        .andWhere('jid NOT IN (:...jids)', { jids: Array.from(incomingJids) })
        .execute()
    } else {
      await WhatsappGroup.createQueryBuilder()
        .update()
        .set({ isMember: false })
        .where('owner_phone_number = :ownerPhoneNumber', { ownerPhoneNumber })
        .execute()
    }

    for (const group of groups) {
      const existing = await WhatsappGroup.findOne({ where: { ownerPhoneNumber, jid: group.jid } })
      if (existing) {
        existing.name = group.name
        existing.participantCount = group.participantCount
        existing.isMember = true
        existing.lastSyncedAt = now
        await existing.save()
        continue
      }

      await WhatsappGroup.save({
        ownerPhoneNumber,
        jid: group.jid,
        name: group.name,
        participantCount: group.participantCount,
        isMember: true,
        lastSyncedAt: now,
      })
    }

    return WhatsappGroup.find({ where: { ownerPhoneNumber, isMember: true }, order: { name: 'ASC' } })
  },

  async list(ownerPhoneNumber: string) {
    return WhatsappGroup.find({ where: { ownerPhoneNumber, isMember: true }, order: { name: 'ASC' } })
  },

  async listActive(ownerPhoneNumber: string) {
    return WhatsappGroup.find({ where: { ownerPhoneNumber, isMember: true, isActive: true }, order: { name: 'ASC' } })
  },

  async getLatestSyncAt(ownerPhoneNumber: string) {
    const latestSyncedGroup = await WhatsappGroup.findOne({
      where: { ownerPhoneNumber, isMember: true },
      order: { lastSyncedAt: 'DESC' },
    })

    return latestSyncedGroup?.lastSyncedAt || null
  },

  async resolveGroupJid(ownerPhoneNumber: string, value: string, options: ResolveGroupOptions = {}) {
    const normalized = value.trim()
    if (!normalized) {
      return null
    }

    const where = options.activeOnly
      ? { ownerPhoneNumber, isMember: true, isActive: true }
      : { ownerPhoneNumber, isMember: true }

    const byJid = await WhatsappGroup.findOne({ where: { jid: normalized, ...where } })
    if (byJid) {
      return byJid.jid
    }

    const byId = await WhatsappGroup.findOne({ where: { id: normalized, ...where } })
    return byId?.jid || null
  },

  async resolveGroupJids(ownerPhoneNumber: string, values: string[], options: ResolveGroupOptions = {}) {
    const resolved = await Promise.all(values.map((value) => this.resolveGroupJid(ownerPhoneNumber, value, options)))
    return resolved.filter((value): value is string => Boolean(value))
  },

  async deactivateDependencies(ownerPhoneNumber: string, groupJid: string) {
    const messages = await AutoMessage.find({ where: { ownerPhoneNumber } })
    for (const message of messages) {
      if (!message.groupIds.includes(groupJid)) {
        continue
      }

      message.groupIds = message.groupIds.filter((value) => value !== groupJid)
      await message.save()
    }

    const schedules = await NotificationSchedule.find({ where: { ownerPhoneNumber } })
    for (const schedule of schedules) {
      if (!schedule.groupJids.includes(groupJid)) {
        continue
      }

      schedule.groupJids = schedule.groupJids.filter((value) => value !== groupJid)
      if (schedule.groupJids.length === 0) {
        schedule.isActive = false
      }
      await schedule.save()
    }

    const settings = await BotConfiguration.findOne({ where: { ownerPhoneNumber } })
    if (settings?.operationalGroupId === groupJid) {
      settings.operationalGroupId = ''
      await settings.save()
    }
  },

  async setActive(ownerPhoneNumber: string, id: string, isActive: boolean) {
    const group = await WhatsappGroup.findOne({ where: { id, ownerPhoneNumber } })
    if (!group) {
      throw new Error('Grupo no encontrado.')
    }

    group.isActive = isActive
    await group.save()

    if (!isActive) {
      await this.deactivateDependencies(ownerPhoneNumber, group.jid)
    }

    return group
  },

  async resolveGroupName(ownerPhoneNumber: string, jid: string) {
    const group = await WhatsappGroup.findOne({ where: { ownerPhoneNumber, jid } })
    return group?.name || null
  },
}