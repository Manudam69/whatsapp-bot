import { WhatsappGroup } from '@/entities/whatsapp_group.entity'

export const groupService = {
  async upsertGroups(groups: Array<{ jid: string; name: string; participantCount: number }>) {
    const now = new Date()

    for (const group of groups) {
      const existing = await WhatsappGroup.findOne({ where: { jid: group.jid } })
      if (existing) {
        existing.name = group.name
        existing.participantCount = group.participantCount
        existing.lastSyncedAt = now
        await existing.save()
        continue
      }

      await WhatsappGroup.save({
        jid: group.jid,
        name: group.name,
        participantCount: group.participantCount,
        lastSyncedAt: now,
      })
    }

    return WhatsappGroup.find({ order: { name: 'ASC' } })
  },

  async list() {
    return WhatsappGroup.find({ order: { name: 'ASC' } })
  },

  async resolveGroupName(jid: string) {
    const group = await WhatsappGroup.findOne({ where: { jid } })
    return group?.name || null
  },
}