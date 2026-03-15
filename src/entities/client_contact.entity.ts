import { Column, Entity, OneToMany } from 'typeorm'
import { EntityBase } from './entity.base'
import { InboundMessage } from './inbound_message.entity'
import { IncidentReport } from './incident_report.entity'

export type ContactFlowState =
  | 'IDLE'
  | 'AWAITING_REPORT'
  | 'AWAITING_SERVICE'
  | 'AWAITING_DATE'
  | 'AWAITING_TIME'
  | 'AWAITING_INCIDENT'
  | 'AWAITING_CONFIRMATION'

@Entity({ name: 'client_contacts' })
export class ClientContact extends EntityBase {
  @Column({ name: 'phone_number', unique: true })
  phoneNumber: string

  @Column({ name: 'whatsapp_jid', unique: true })
  whatsappJid: string

  @Column({ name: 'contact_name', nullable: true })
  contactName?: string

  @Column({ name: 'current_flow', default: 'IDLE' })
  currentFlow: ContactFlowState

  @Column({ name: 'last_inbound_at', type: 'timestamptz', nullable: true })
  lastInboundAt?: Date

  @Column({ name: 'last_report_at', type: 'timestamptz', nullable: true })
  lastReportAt?: Date

  @Column({ name: 'draft_service_name', nullable: true })
  draftServiceName?: string

  @Column({ name: 'draft_incident_date', nullable: true })
  draftIncidentDate?: string

  @Column({ name: 'draft_incident_time', nullable: true })
  draftIncidentTime?: string

  @Column({ name: 'draft_incident_text', type: 'text', nullable: true })
  draftIncidentText?: string

  @OneToMany(() => InboundMessage, (message) => message.contact)
  inboundMessages: InboundMessage[]

  @OneToMany(() => IncidentReport, (report) => report.contact)
  reports: IncidentReport[]
}