import { Column, Entity } from 'typeorm'
import { EntityBase } from './entity.base'

export type BotStrategy = 'official-api' | 'external-provider' | 'hybrid-automation'

@Entity({ name: 'bot_configurations' })
export class BotConfiguration extends EntityBase {
  @Column({ name: 'report_keyword', default: 'REPORTE' })
  reportKeyword: string

  @Column({ name: 'retry_attempts', default: 3 })
  retryAttempts: number

  @Column({ name: 'retry_delay_ms', default: 2000 })
  retryDelayMs: number

  @Column({ name: 'dispatch_window_minutes', default: 12 })
  dispatchWindowMinutes: number

  @Column({ name: 'concurrency_limit', default: 18 })
  concurrencyLimit: number

  @Column({ name: 'operational_group_id', nullable: true })
  operationalGroupId?: string

  @Column({ name: 'first_reply_text', type: 'text', default: 'Gracias por tu mensaje. Tu reporte fue recibido y enviado al grupo operativo para seguimiento.' })
  firstReplyText: string

  @Column({ name: 'first_reply_enabled', default: true })
  firstReplyEnabled: boolean

  @Column({ name: 'confirmation_enabled', default: true })
  confirmationEnabled: boolean

  @Column({ default: 'hybrid-automation' })
  strategy: BotStrategy
}