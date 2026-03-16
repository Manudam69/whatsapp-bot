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
    let settings = await BotConfiguration.findOne({ order: { createdAt: 'ASC' } })
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

    return settings
  },

  async update(input: BotConfigurationInput) {
    const settings = await this.get()

    if (input.operationalGroupId !== undefined) {
      input.operationalGroupId = input.operationalGroupId ? (await groupService.resolveGroupJid(input.operationalGroupId)) || '' : ''
    }

    Object.assign(settings, input)
    await settings.save()
    return settings
  },
}