import { AutoMessage } from '@/entities/auto_message.entity'
import { BotConfiguration } from '@/entities/bot_configuration.entity'
import { NotificationSchedule } from '@/entities/notification_schedule.entity'
import { WhatsappGroup } from '@/entities/whatsapp_group.entity'

type ResolveGroupOptions = {
  activeOnly?: boolean
}

export const groupService = {
  async upsertGroups(groups: Array<{ jid: string; name: string; participantCount: number }>) {
    const now = new Date()
    const incomingJids = new Set(groups.map((group) => group.jid))

    if (groups.length > 0) {
      await WhatsappGroup.createQueryBuilder()
        .update()
        .set({ isMember: false })
        .where('jid NOT IN (:...jids)', { jids: Array.from(incomingJids) })
        .execute()
    }

    for (const group of groups) {
      const existing = await WhatsappGroup.findOne({ where: { jid: group.jid } })
      if (existing) {
        existing.name = group.name
        existing.participantCount = group.participantCount
        existing.isMember = true
        existing.lastSyncedAt = now
        await existing.save()
        continue
      }

      await WhatsappGroup.save({
        jid: group.jid,
        name: group.name,
        participantCount: group.participantCount,
        isMember: true,
        lastSyncedAt: now,
      })
    }

    return WhatsappGroup.find({ where: { isMember: true }, order: { name: 'ASC' } })
  },

  async list() {
    return WhatsappGroup.find({ where: { isMember: true }, order: { name: 'ASC' } })
  },

  async listActive() {
    return WhatsappGroup.find({ where: { isMember: true, isActive: true }, order: { name: 'ASC' } })
  },

  async getLatestSyncAt() {
    const latestSyncedGroup = await WhatsappGroup.findOne({
      where: { isMember: true },
      order: { lastSyncedAt: 'DESC' },
    })

    return latestSyncedGroup?.lastSyncedAt || null
  },

  async resolveGroupJid(value: string, options: ResolveGroupOptions = {}) {
    const normalized = value.trim()
    if (!normalized) {
      return null
    }

    const where = options.activeOnly ? { isMember: true, isActive: true } : { isMember: true }

    const byJid = await WhatsappGroup.findOne({ where: { jid: normalized, ...where } })
    if (byJid) {
      return byJid.jid
    }

    const byId = await WhatsappGroup.findOne({ where: { id: normalized, ...where } })
    return byId?.jid || null
  },

  async resolveGroupJids(values: string[], options: ResolveGroupOptions = {}) {
    const resolved = await Promise.all(values.map((value) => this.resolveGroupJid(value, options)))
    return resolved.filter((value): value is string => Boolean(value))
  },

  async deactivateDependencies(groupJid: string) {
    const messages = await AutoMessage.find()
    for (const message of messages) {
      if (!message.groupIds.includes(groupJid)) {
        continue
      }

      message.groupIds = message.groupIds.filter((value) => value !== groupJid)
      await message.save()
    }

    const schedules = await NotificationSchedule.find()
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

    const [settings] = await BotConfiguration.find({ order: { createdAt: 'ASC' }, take: 1 })
    if (settings?.operationalGroupId === groupJid) {
      settings.operationalGroupId = ''
      await settings.save()
    }
  },

  async setActive(id: string, isActive: boolean) {
    const group = await WhatsappGroup.findOne({ where: { id } })
    if (!group) {
      throw new Error('Grupo no encontrado.')
    }

    group.isActive = isActive
    await group.save()

    if (!isActive) {
      await this.deactivateDependencies(group.jid)
    }

    return group
  },

  async resolveGroupName(jid: string) {
    const group = await WhatsappGroup.findOne({ where: { jid } })
    return group?.name || null
  },
}