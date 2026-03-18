import { AutoMessage } from '@/entities/auto_message.entity'
import { BotConfiguration } from '@/entities/bot_configuration.entity'
import { NotificationSchedule } from '@/entities/notification_schedule.entity'
import { WhatsappGroup } from '@/entities/whatsapp_group.entity'

type ResolveGroupOptions = {
  activeOnly?: boolean
}

export const groupService = {
  async upsertGroups(sessionId: string, groups: Array<{ jid: string; name: string; participantCount: number }>) {
    const now = new Date()
    const incomingJids = new Set(groups.map((group) => group.jid))

    if (groups.length > 0) {
      await WhatsappGroup.createQueryBuilder()
        .update()
        .set({ isMember: false })
        .where('session_id = :sessionId', { sessionId })
        .andWhere('jid NOT IN (:...jids)', { jids: Array.from(incomingJids) })
        .execute()
    } else {
      await WhatsappGroup.createQueryBuilder()
        .update()
        .set({ isMember: false })
        .where('session_id = :sessionId', { sessionId })
        .execute()
    }

    for (const group of groups) {
      const existing = await WhatsappGroup.findOne({ where: { sessionId, jid: group.jid } })
      if (existing) {
        existing.name = group.name
        existing.participantCount = group.participantCount
        existing.isMember = true
        existing.lastSyncedAt = now
        await existing.save()
        continue
      }

      await WhatsappGroup.save({
        sessionId,
        jid: group.jid,
        name: group.name,
        participantCount: group.participantCount,
        isMember: true,
        lastSyncedAt: now,
      })
    }

    return WhatsappGroup.find({ where: { sessionId, isMember: true }, order: { name: 'ASC' } })
  },

  async list(sessionId: string) {
    return WhatsappGroup.find({ where: { sessionId, isMember: true }, order: { name: 'ASC' } })
  },

  async listActive(sessionId: string) {
    return WhatsappGroup.find({ where: { sessionId, isMember: true, isActive: true }, order: { name: 'ASC' } })
  },

  async getLatestSyncAt(sessionId: string) {
    const latestSyncedGroup = await WhatsappGroup.findOne({
      where: { sessionId, isMember: true },
      order: { lastSyncedAt: 'DESC' },
    })

    return latestSyncedGroup?.lastSyncedAt || null
  },

  async resolveGroupJid(sessionId: string, value: string, options: ResolveGroupOptions = {}) {
    const normalized = value.trim()
    if (!normalized) {
      return null
    }

    const where = options.activeOnly
      ? { sessionId, isMember: true, isActive: true }
      : { sessionId, isMember: true }

    const byJid = await WhatsappGroup.findOne({ where: { jid: normalized, ...where } })
    if (byJid) {
      return byJid.jid
    }

    const byId = await WhatsappGroup.findOne({ where: { id: normalized, ...where } })
    return byId?.jid || null
  },

  async resolveGroupJids(sessionId: string, values: string[], options: ResolveGroupOptions = {}) {
    const resolved = await Promise.all(values.map((value) => this.resolveGroupJid(sessionId, value, options)))
    return resolved.filter((value): value is string => Boolean(value))
  },

  async deactivateDependencies(sessionId: string, clientId: string, groupJid: string) {
    const messages = await AutoMessage.find({ where: { clientId } })
    for (const message of messages) {
      if (!message.groupIds.includes(groupJid)) {
        continue
      }

      message.groupIds = message.groupIds.filter((value) => value !== groupJid)
      await message.save()
    }

    const schedules = await NotificationSchedule.find({ where: { clientId } })
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

    const settings = await BotConfiguration.findOne({ where: { clientId } })
    if (settings?.operationalGroupId === groupJid) {
      settings.operationalGroupId = ''
      await settings.save()
    }
  },

  async setActive(sessionId: string, clientId: string, id: string, isActive: boolean) {
    const group = await WhatsappGroup.findOne({ where: { id, sessionId } })
    if (!group) {
      throw new Error('Grupo no encontrado.')
    }

    group.isActive = isActive
    await group.save()

    if (!isActive) {
      await this.deactivateDependencies(sessionId, clientId, group.jid)
    }

    return group
  },

  async resolveGroupName(sessionId: string, jid: string) {
    const group = await WhatsappGroup.findOne({ where: { sessionId, jid } })
    return group?.name || null
  },
}
