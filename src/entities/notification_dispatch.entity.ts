import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm'
import { EntityBase } from './entity.base'
import { NotificationSchedule } from './notification_schedule.entity'

export type DispatchStatus = 'PENDING' | 'SENT' | 'FAILED'

@Entity({ name: 'notification_dispatches' })
export class NotificationDispatch extends EntityBase {
  @ManyToOne(() => NotificationSchedule, { eager: true, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'schedule_id' })
  schedule?: NotificationSchedule | null

  @Column({ name: 'group_jid' })
  groupJid: string

  @Column({ name: 'group_name', nullable: true })
  groupName?: string

  @Column({ default: 'PENDING' })
  status: DispatchStatus

  @Column({ default: 1 })
  attempts: number

  @Column({ name: 'executed_at', type: 'timestamptz' })
  executedAt: Date

  @Column({ name: 'message_text', type: 'text', nullable: true })
  messageText?: string

  @Column({ name: 'media_asset_path', nullable: true })
  mediaAssetPath?: string

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string
}