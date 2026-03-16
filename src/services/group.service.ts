import { WhatsappGroup } from '@/entities/whatsapp_group.entity'

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

  async getLatestSyncAt() {
    const latestSyncedGroup = await WhatsappGroup.findOne({
      where: { isMember: true },
      order: { lastSyncedAt: 'DESC' },
    })

    return latestSyncedGroup?.lastSyncedAt || null
  },

  async resolveGroupJid(value: string) {
    const normalized = value.trim()
    if (!normalized) {
      return null
    }

    const byJid = await WhatsappGroup.findOne({ where: { jid: normalized, isMember: true } })
    if (byJid) {
      return byJid.jid
    }

    const byId = await WhatsappGroup.findOne({ where: { id: normalized, isMember: true } })
    return byId?.jid || null
  },

  async resolveGroupJids(values: string[]) {
    const resolved = await Promise.all(values.map((value) => this.resolveGroupJid(value)))
    return resolved.filter((value): value is string => Boolean(value))
  },

  async setActive(id: string, isActive: boolean) {
    const group = await WhatsappGroup.findOne({ where: { id } })
    if (!group) {
      throw new Error('Grupo no encontrado.')
    }

    group.isActive = isActive
    await group.save()
    return group
  },

  async resolveGroupName(jid: string) {
    const group = await WhatsappGroup.findOne({ where: { jid } })
    return group?.name || null
  },
}