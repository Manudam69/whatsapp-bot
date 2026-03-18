import { Column, Entity, Index } from 'typeorm'
import { EntityBase } from './entity.base'

export type WhatsappSessionStatus = 'idle' | 'connecting' | 'qr' | 'connected' | 'disconnected'

@Entity({ name: 'whatsapp_sessions' })
export class WhatsappSession extends EntityBase {
  @Column({ name: 'client_id' })
  clientId: string

  @Column({ name: 'phone_number', type: 'varchar', nullable: true })
  phoneNumber: string | null

  @Index({ unique: true })
  @Column({ name: 'auth_dir_key' })
  authDirKey: string

  @Column({ default: 'idle' })
  status: WhatsappSessionStatus

  @Column({ name: 'connected_at', type: 'timestamptz', nullable: true })
  connectedAt: Date | null
}
