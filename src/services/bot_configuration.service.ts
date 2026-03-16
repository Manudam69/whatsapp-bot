import { config } from '@/config'
import { BotConfiguration } from '@/entities/bot_configuration.entity'
import { groupService } from './group.service'

type BotConfigurationInput = Partial<Pick<
  BotConfiguration,
  | 'reportKeyword'
  | 'retryAttempts'
  | 'retryDelayMs'
  | 'dispatchWindowMinutes'
  | 'concurrencyLimit'
  | 'operationalGroupId'
  | 'firstReplyText'
  | 'firstReplyEnabled'
  | 'confirmationEnabled'
  | 'strategy'
>>

const defaultFirstReply = 'Gracias por tu mensaje. Tu reporte fue recibido y enviado al grupo operativo para seguimiento.'

function buildDefaultSettings(ownerPhoneNumber: string) {
  return BotConfiguration.create({
    ownerPhoneNumber,
    reportKeyword: 'REPORTE',
    retryAttempts: config.MAX_SEND_RETRIES,
    retryDelayMs: 2000,
    dispatchWindowMinutes: 12,
    concurrencyLimit: 18,
    operationalGroupId: undefined,
    firstReplyText: defaultFirstReply,
    firstReplyEnabled: true,
    confirmationEnabled: true,
    strategy: 'hybrid-automation',
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