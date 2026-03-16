import { config } from '@/config'
import { BotConfiguration, type BotConfigurationSettings } from '@/entities/bot_configuration.entity'
import { groupService } from './group.service'

type BotConfigurationInput = Partial<BotConfigurationSettings>

function buildDefaultSettings(ownerPhoneNumber: string) {
  return BotConfiguration.create({
    ownerPhoneNumber,
    settings: {
      retryAttempts: config.MAX_SEND_RETRIES,
    },
  })
}

export const botConfigurationService = {
  buildDefaults(ownerPhoneNumber = '') {
    return buildDefaultSettings(ownerPhoneNumber)
  },

  async get(ownerPhoneNumber: string) {
    const settingsRecord = await BotConfiguration.findOne({ where: { ownerPhoneNumber } })

    let settings = settingsRecord
    if (!settings) {
      settings = await buildDefaultSettings(ownerPhoneNumber).save()
    }

    if (settings.operationalGroupId) {
      const activeOperationalGroupId = await groupService.resolveGroupJid(ownerPhoneNumber, settings.operationalGroupId, { activeOnly: true })
      if (!activeOperationalGroupId) {
        settings.operationalGroupId = ''
        await settings.save()
      }
    }

    return settings
  },

  async update(ownerPhoneNumber: string, input: BotConfigurationInput) {
    const settings = await this.get(ownerPhoneNumber)

    if (input.operationalGroupId !== undefined) {
      input.operationalGroupId = input.operationalGroupId
        ? (await groupService.resolveGroupJid(ownerPhoneNumber, input.operationalGroupId, { activeOnly: true })) || ''
        : ''
    }

    Object.assign(settings, input)
    await settings.save()
    return settings
  },
}