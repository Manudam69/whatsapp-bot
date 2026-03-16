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

export const botConfigurationService = {
  async get() {
    const [settingsRecord] = await BotConfiguration.find({
      order: { createdAt: 'ASC' },
      take: 1,
    })

    let settings = settingsRecord
    if (!settings) {
      settings = await BotConfiguration.save({
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

    if (settings.operationalGroupId) {
      const activeOperationalGroupId = await groupService.resolveGroupJid(settings.operationalGroupId, { activeOnly: true })
      if (!activeOperationalGroupId) {
        settings.operationalGroupId = ''
        await settings.save()
      }
    }

    return settings
  },

  async update(input: BotConfigurationInput) {
    const settings = await this.get()

    if (input.operationalGroupId !== undefined) {
      input.operationalGroupId = input.operationalGroupId ? (await groupService.resolveGroupJid(input.operationalGroupId, { activeOnly: true })) || '' : ''
    }

    Object.assign(settings, input)
    await settings.save()
    return settings
  },
}