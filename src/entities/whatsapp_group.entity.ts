import { Column, Entity, Index } from 'typeorm'
import { EntityBase } from './entity.base'

@Entity({ name: 'whatsapp_groups' })
@Index('IDX_whatsapp_groups_session_id', ['sessionId'])
@Index('UQ_whatsapp_groups_session_jid', ['sessionId', 'jid'], { unique: true })
export class WhatsappGroup extends EntityBase {
  @Column({ name: 'session_id' })
  sessionId: string

  @Column()
  jid: string

  @Column()
  name: string

  @Column({ name: 'participant_count', default: 0 })
  participantCount: number

  @Column({ name: 'is_active', default: true })
  isActive: boolean

  @Column({ name: 'is_member', default: true })
  isMember: boolean

  @Column({ name: 'last_synced_at', type: 'timestamptz', nullable: true })
  lastSyncedAt?: Date
}
