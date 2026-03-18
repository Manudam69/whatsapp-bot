import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm'
import { EntityBase } from './entity.base'
import { ClientContact } from './client_contact.entity'

export type ReportStatus = 'RECEIVED' | 'QUEUED' | 'FORWARDED' | 'FAILED'

@Entity({ name: 'incident_reports' })
export class IncidentReport extends EntityBase {
  @Column({ name: 'client_id' })
  clientId: string

  @Column({ unique: true })
  folio: string

  @ManyToOne(() => ClientContact, (contact) => contact.reports, { eager: true, nullable: false })
  @JoinColumn({ name: 'contact_id' })
  contact: ClientContact

  @Column({ name: 'service_name' })
  serviceName: string

  @Column({ name: 'incident_date' })
  incidentDate: string

  @Column({ name: 'incident_time' })
  incidentTime: string

  @Column({ name: 'incident_text', type: 'text' })
  incidentText: string

  @Column({ name: 'source_message', type: 'text' })
  sourceMessage: string

  @Column({ name: 'status', default: 'RECEIVED' })
  status: ReportStatus

  @Column({ name: 'review_status', default: 'pending' })
  reviewStatus: 'pending' | 'reviewed' | 'resolved'

  @Column({ name: 'received_at', type: 'timestamptz' })
  receivedAt: Date

  @Column({ name: 'forwarded_at', type: 'timestamptz', nullable: true })
  forwardedAt?: Date

  @Column({ name: 'forwarded_group_jid', type: 'varchar', nullable: true })
  forwardedGroupJid?: string

  @Column({ name: 'forwarded_group_name', type: 'varchar', nullable: true })
  forwardedGroupName?: string

  @Column({ name: 'is_archived', default: false })
  isArchived: boolean
}
