import { config } from '@/config'
import { BotConfiguration, type BotConfigurationSettings } from '@/entities/bot_configuration.entity'
import { groupService } from './group.service'

type BotConfigurationInput = Partial<BotConfigurationSettings>

function buildDefaultSettings(clientId: string) {
  return BotConfiguration.create({
    clientId,
    settings: {
      retryAttempts: config.MAX_SEND_RETRIES,
    },
  })
}

export const botConfigurationService = {
  buildDefaults(clientId = '') {
    return buildDefaultSettings(clientId)
  },

  async get(clientId: string, sessionId?: string) {
    const settingsRecord = await BotConfiguration.findOne({ where: { clientId } })

    let settings = settingsRecord
    if (!settings) {
      settings = await buildDefaultSettings(clientId).save()
    }

    if (settings.operationalGroupId && sessionId) {
      const activeOperationalGroupId = await groupService.resolveGroupJid(sessionId, settings.operationalGroupId, { activeOnly: true })
      if (!activeOperationalGroupId) {
        settings.operationalGroupId = ''
        await settings.save()
      }
    }

    return settings
  },

  async update(clientId: string, sessionId: string, input: BotConfigurationInput) {
    const settings = await this.get(clientId, sessionId)

    if (input.operationalGroupId !== undefined) {
      input.operationalGroupId = input.operationalGroupId
        ? (await groupService.resolveGroupJid(sessionId, input.operationalGroupId, { activeOnly: true })) || ''
        : ''
    }

    Object.assign(settings, input)
    await settings.save()
    return settings
  },
}
