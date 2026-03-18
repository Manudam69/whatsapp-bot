import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm'
import { EntityBase } from './entity.base'
import { MediaAsset } from './media_asset.entity'

@Entity({ name: 'notification_schedules' })
export class NotificationSchedule extends EntityBase {
  @Column({ name: 'owner_phone_number' })
  ownerPhoneNumber: string

  @Column()
  name: string

  @Column({ name: 'message_text', type: 'text', nullable: true })
  messageText?: string

  @Column({ name: 'days_of_week', type: 'jsonb', default: () => "'[]'" })
  daysOfWeek: number[]

  @Column({ type: 'jsonb', default: () => "'[]'" })
  times: string[]

  @Column({ name: 'group_jids', type: 'jsonb', default: () => "'[]'" })
  groupJids: string[]

  @Column({ name: 'message_template_id', nullable: true })
  messageTemplateId?: string

  @Column({ name: 'message_template_ids', type: 'jsonb', default: () => "'[]'" })
  messageTemplateIds: string[]

  @Column({ name: 'is_active', default: true })
  isActive: boolean

  @Column({ name: 'retry_limit', default: 3 })
  retryLimit: number

  @Column({ name: 'throttle_ms', default: 1500 })
  throttleMs: number

  @Column({ name: 'last_execution_key', nullable: true })
  lastExecutionKey?: string

  @ManyToOne(() => MediaAsset, { eager: true, nullable: true })
  @JoinColumn({ name: 'media_asset_id' })
  mediaAsset?: MediaAsset | null
}