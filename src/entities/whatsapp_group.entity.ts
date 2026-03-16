import { Column, Entity } from 'typeorm'
import { EntityBase } from './entity.base'

@Entity({ name: 'whatsapp_groups' })
export class WhatsappGroup extends EntityBase {
  @Column({ unique: true })
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