import { Column, Entity, Index } from 'typeorm'
import { EntityBase } from './entity.base'

export type BotStrategy = 'official-api' | 'external-provider' | 'hybrid-automation'

export interface BotConfigurationSettings {
  reportKeyword: string
  retryAttempts: number
  retryDelayMs: number
  dispatchWindowMinutes: number
  concurrencyLimit: number
  operationalGroupId?: string
  firstReplyText: string
  firstReplyEnabled: boolean
  confirmationEnabled: boolean
  reviewedReplyText: string
  resolvedReplyText: string
  strategy: BotStrategy
}

export const DEFAULT_REVIEWED_REPLY_TEXT = [
  '*ACTUALIZACION DE REPORTE*',
  '',
  'Tu reporte *{{folio}}* ya esta siendo revisado por el equipo.',
  'Te compartiremos una nueva actualizacion cuando quede resuelto.',
].join('\n')

export const DEFAULT_RESOLVED_REPLY_TEXT = [
  '*ACTUALIZACION DE REPORTE*',
  '',
  'Tu reporte *{{folio}}* fue marcado como resuelto.',
  'Si el problema continua, responde a este mensaje para dar seguimiento.',
].join('\n')

const DEFAULT_SETTINGS: BotConfigurationSettings = {
  reportKeyword: 'REPORTE',
  retryAttempts: 3,
  retryDelayMs: 2000,
  dispatchWindowMinutes: 12,
  concurrencyLimit: 18,
  operationalGroupId: undefined,
  firstReplyText: 'Gracias por tu mensaje. Tu reporte fue recibido y enviado al grupo operativo para seguimiento.',
  firstReplyEnabled: true,
  confirmationEnabled: true,
  reviewedReplyText: DEFAULT_REVIEWED_REPLY_TEXT,
  resolvedReplyText: DEFAULT_RESOLVED_REPLY_TEXT,
  strategy: 'hybrid-automation',
}

function normalizeOptionalText(value?: string | null) {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

function normalizeRequiredText(value: string | undefined, fallback: string) {
  const normalized = value?.trim()
  return normalized ? normalized : fallback
}

function normalizeSettings(input?: Partial<BotConfigurationSettings>): BotConfigurationSettings {
  const merged = {
    ...DEFAULT_SETTINGS,
    ...(input ?? {}),
  }

  return {
    ...merged,
    operationalGroupId: normalizeOptionalText(merged.operationalGroupId),
    firstReplyText: normalizeRequiredText(merged.firstReplyText, DEFAULT_SETTINGS.firstReplyText),
    reviewedReplyText: normalizeRequiredText(merged.reviewedReplyText, DEFAULT_SETTINGS.reviewedReplyText),
    resolvedReplyText: normalizeRequiredText(merged.resolvedReplyText, DEFAULT_SETTINGS.resolvedReplyText),
  }
}

@Entity({ name: 'bot_configurations' })
@Index('UQ_bot_configurations_owner_phone_number', ['ownerPhoneNumber'], { unique: true })
export class BotConfiguration extends EntityBase {
  @Column({ name: 'owner_phone_number' })
  ownerPhoneNumber: string

  @Column({ name: 'settings', type: 'jsonb', default: () => "'{}'::jsonb" })
  private settingsData: Partial<BotConfigurationSettings>

  get settings() {
    return normalizeSettings(this.settingsData)
  }

  set settings(value: Partial<BotConfigurationSettings>) {
    this.settingsData = normalizeSettings(value)
  }

  private getSetting<K extends keyof BotConfigurationSettings>(key: K): BotConfigurationSettings[K] {
    return this.settings[key] as BotConfigurationSettings[K]
  }

  private setSetting<K extends keyof BotConfigurationSettings>(key: K, value: BotConfigurationSettings[K]) {
    this.settingsData = normalizeSettings({
      ...this.settingsData,
      [key]: value,
    })
  }

  get reportKeyword() {
    return this.getSetting('reportKeyword')
  }

  set reportKeyword(value: string) {
    this.setSetting('reportKeyword', normalizeRequiredText(value, DEFAULT_SETTINGS.reportKeyword))
  }

  get retryAttempts() {
    return this.getSetting('retryAttempts')
  }

  set retryAttempts(value: number) {
    this.setSetting('retryAttempts', value)
  }

  get retryDelayMs() {
    return this.getSetting('retryDelayMs')
  }

  set retryDelayMs(value: number) {
    this.setSetting('retryDelayMs', value)
  }

  get dispatchWindowMinutes() {
    return this.getSetting('dispatchWindowMinutes')
  }

  set dispatchWindowMinutes(value: number) {
    this.setSetting('dispatchWindowMinutes', value)
  }

  get concurrencyLimit() {
    return this.getSetting('concurrencyLimit')
  }

  set concurrencyLimit(value: number) {
    this.setSetting('concurrencyLimit', value)
  }

  get operationalGroupId() {
    return this.getSetting('operationalGroupId')
  }

  set operationalGroupId(value: string | undefined) {
    this.setSetting('operationalGroupId', normalizeOptionalText(value))
  }

  get firstReplyText() {
    return this.getSetting('firstReplyText')
  }

  set firstReplyText(value: string) {
    this.setSetting('firstReplyText', normalizeRequiredText(value, DEFAULT_SETTINGS.firstReplyText))
  }

  get firstReplyEnabled() {
    return this.getSetting('firstReplyEnabled')
  }

  set firstReplyEnabled(value: boolean) {
    this.setSetting('firstReplyEnabled', value)
  }

  get confirmationEnabled() {
    return this.getSetting('confirmationEnabled')
  }

  set confirmationEnabled(value: boolean) {
    this.setSetting('confirmationEnabled', value)
  }

  get reviewedReplyText() {
    return this.getSetting('reviewedReplyText')
  }

  set reviewedReplyText(value: string) {
    this.setSetting('reviewedReplyText', normalizeRequiredText(value, DEFAULT_SETTINGS.reviewedReplyText))
  }

  get resolvedReplyText() {
    return this.getSetting('resolvedReplyText')
  }

  set resolvedReplyText(value: string) {
    this.setSetting('resolvedReplyText', normalizeRequiredText(value, DEFAULT_SETTINGS.resolvedReplyText))
  }

  get strategy() {
    return this.getSetting('strategy')
  }

  set strategy(value: BotStrategy) {
    this.setSetting('strategy', value)
  }
}