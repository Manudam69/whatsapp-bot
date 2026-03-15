import { config } from '@/config'
import { ClientContact } from '@/entities/client_contact.entity'
import { IncidentReport } from '@/entities/incident_report.entity'
import { groupService } from './group.service'
import { ParsedIncidentReport } from './report_parser.service'

function buildFolio() {
  const now = new Date()
  const date = now.toISOString().slice(0, 10).replace(/-/g, '')
  const random = Math.floor(1000 + Math.random() * 9000)
  return `REP-${date}-${random}`
}

export function formatReportMessage(report: IncidentReport) {
  return [
    '*NUEVO REPORTE DE INCIDENCIA*',
    '',
    `*Folio:* ${report.folio}`,
    `*Cliente/Numero:* ${report.contact.phoneNumber}`,
    `*Nombre de contacto:* ${report.contact.contactName || 'NO DISPONIBLE'}`,
    `*Servicio:* ${report.serviceName}`,
    `*Fecha:* ${report.incidentDate}`,
    `*Hora:* ${report.incidentTime}`,
    `*Incidencia:* ${report.incidentText}`,
    `*Recibido el:* ${report.receivedAt.toISOString()}`,
  ].join('\n')
}

export const reportService = {
  async createFromInbound(contact: ClientContact, parsed: ParsedIncidentReport, sourceMessage: string) {
    const report = IncidentReport.create({
      folio: buildFolio(),
      contact,
      serviceName: parsed.serviceName,
      incidentDate: parsed.incidentDate,
      incidentTime: parsed.incidentTime,
      incidentText: parsed.incidentText,
      sourceMessage,
      receivedAt: new Date(),
      status: 'RECEIVED',
    })

    await report.save()
    contact.lastReportAt = new Date()
    await contact.save()
    return report
  },

  async markForwarded(report: IncidentReport, groupJid: string) {
    report.status = 'FORWARDED'
    report.forwardedAt = new Date()
    report.forwardedGroupJid = groupJid
    report.forwardedGroupName = (await groupService.resolveGroupName(groupJid)) || undefined
    await report.save()
    return report
  },

  async markQueued(report: IncidentReport, groupJid: string) {
    report.status = 'QUEUED'
    report.forwardedGroupJid = groupJid
    report.forwardedGroupName = (await groupService.resolveGroupName(groupJid)) || undefined
    await report.save()
    return report
  },

  async markFailed(report: IncidentReport, groupJid?: string) {
    report.status = 'FAILED'
    report.forwardedGroupJid = groupJid
    await report.save()
    return report
  },

  async list() {
    return IncidentReport.find({ order: { receivedAt: 'DESC' }, take: 100 })
  },

  async findById(id: string) {
    return IncidentReport.findOne({ where: { id } })
  },

  getOperationsGroupJid() {
    return config.OPERATIONS_GROUP_JID
  },
}