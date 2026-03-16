import { Column, Entity } from 'typeorm'
import { EntityBase } from './entity.base'

export type OutboundMessageStatus = 'PENDING' | 'SENT' | 'FAILED'
export type OutboundMessageType = 'TEXT' | 'IMAGE'
export type OutboundMessageSource = 'FLOW_REPLY' | 'REPORT_FORWARD' | 'REPORT_STATUS_UPDATE' | 'SCHEDULE'

@Entity({ name: 'outbound_messages' })
export class OutboundMessage extends EntityBase {
  @Column({ name: 'owner_phone_number' })
  ownerPhoneNumber: string

  @Column({ name: 'recipient_jid' })
  recipientJid: string

  @Column({ name: 'message_type' })
  messageType: OutboundMessageType

  @Column({ name: 'message_text', type: 'text', nullable: true })
  messageText?: string

  @Column({ name: 'media_file_path', nullable: true })
  mediaFilePath?: string

  @Column({ name: 'caption', type: 'text', nullable: true })
  caption?: string

  @Column({ default: 'PENDING' })
  status: OutboundMessageStatus

  @Column({ default: 0 })
  attempts: number

  @Column({ name: 'max_attempts', default: 3 })
  maxAttempts: number

  @Column({ name: 'retry_delay_ms', default: 1500 })
  retryDelayMs: number

  @Column({ name: 'last_attempt_at', type: 'timestamptz', nullable: true })
  lastAttemptAt?: Date

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt?: Date

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string

  @Column({ name: 'source_type', default: 'FLOW_REPLY' })
  sourceType: OutboundMessageSource

  @Column({ name: 'source_id', nullable: true })
  sourceId?: string

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>
}