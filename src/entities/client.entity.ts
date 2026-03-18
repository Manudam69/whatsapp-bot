import { Column, Entity } from 'typeorm'
import { EntityBase } from './entity.base'

@Entity({ name: 'clients' })
export class Client extends EntityBase {
  @Column({ unique: true })
  name: string

  @Column({ name: 'display_name' })
  displayName: string

  @Column({ name: 'display_logo', type: 'jsonb', nullable: true })
  displayLogo: Record<string, unknown> | null

  @Column({ type: 'jsonb', nullable: true })
  secrets: Record<string, unknown> | null

  @Column({ type: 'jsonb', nullable: true })
  flags: Record<string, unknown> | null

  @Column({ name: 'public_config', type: 'jsonb', nullable: true })
  publicConfig: Record<string, unknown> | null

  @Column({ name: 'email_config', type: 'jsonb', nullable: true })
  emailConfig: Record<string, unknown> | null

  @Column({ type: 'jsonb', nullable: true })
  customization: Record<string, unknown> | null

  @Column({ name: 'enabled_entities', type: 'jsonb', nullable: true })
  enabledEntities: Record<string, unknown> | null

  @Column({ name: 'disabled_entities', type: 'jsonb', nullable: true })
  disabledEntities: Record<string, unknown> | null

  @Column({ name: 'client_class', type: 'varchar', nullable: true })
  clientClass: string | null
}
