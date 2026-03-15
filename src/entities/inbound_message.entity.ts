import { Column, Entity, Index, ManyToOne, JoinColumn } from 'typeorm'
import { EntityBase } from './entity.base'
import { ClientContact } from './client_contact.entity'

@Index('IDX_inbound_messages_external_message_id', ['externalMessageId'], { unique: true })
@Entity({ name: 'inbound_messages' })
export class InboundMessage extends EntityBase {
  @ManyToOne(() => ClientContact, (contact) => contact.inboundMessages, { eager: true, nullable: false })
  @JoinColumn({ name: 'contact_id' })
  contact: ClientContact

  @Column({ name: 'external_message_id', nullable: true })
  externalMessageId?: string

  @Column({ name: 'from_jid' })
  fromJid: string

  @Column({ type: 'text' })
  body: string

  @Column({ name: 'message_type', default: 'text' })
  messageType: string

  @Column({ name: 'received_at', type: 'timestamptz' })
  receivedAt: Date

  @Column({ name: 'raw_payload', type: 'jsonb', nullable: true })
  rawPayload?: Record<string, unknown>
}