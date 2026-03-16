import { config } from '@/config'
import { ClientContact } from '@/entities/client_contact.entity'
import { IncidentReport } from '@/entities/incident_report.entity'
import { NotFound } from '@/middlewares/error_handler'
import { groupService } from './group.service'
import { ParsedIncidentReport } from './report_parser.service'

function buildFolio() {
  const now = new Date()
  const date = now.toISOString().slice(0, 10).replace(/-/g, '')
  const random = Math.floor(1000 + Math.random() * 9000)
  return `REP-${date}-${random}`
}

export function formatReportMessage(report: IncidentReport) {
  const receivedAt = report.receivedAt.toLocaleString('es-MX', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'America/Mexico_City',
  })

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
    `*Recibido el:* ${receivedAt}`,
  ].join('\n')
}

export function formatReportStatusNotification(report: IncidentReport) {
  if (report.reviewStatus === 'reviewed') {
    return [
      '*ACTUALIZACION DE REPORTE*',
      '',
      `Tu reporte *${report.folio}* ya esta siendo revisado por el equipo.`,
      'Te compartiremos una nueva actualizacion cuando quede resuelto.',
    ].join('\n')
  }

  if (report.reviewStatus === 'resolved') {
    return [
      '*ACTUALIZACION DE REPORTE*',
      '',
      `Tu reporte *${report.folio}* fue marcado como resuelto.`,
      'Si el problema continua, responde a este mensaje para dar seguimiento.',
    ].join('\n')
  }

  return null
}

export const reportService = {
  async createFromInbound(contact: ClientContact, parsed: ParsedIncidentReport, sourceMessage: string) {
    const report = IncidentReport.create({
      ownerPhoneNumber: contact.ownerPhoneNumber,
      folio: buildFolio(),
      contact,
      serviceName: parsed.serviceName,
      incidentDate: parsed.incidentDate,
      incidentTime: parsed.incidentTime,
      incidentText: parsed.incidentText,
      sourceMessage,
      receivedAt: new Date(),
      status: 'RECEIVED',
      reviewStatus: 'pending',
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
    report.forwardedGroupName = (await groupService.resolveGroupName(report.ownerPhoneNumber, groupJid)) || undefined
    await report.save()
    return report
  },

  async markQueued(report: IncidentReport, groupJid: string) {
    report.status = 'QUEUED'
    report.forwardedGroupJid = groupJid
    report.forwardedGroupName = (await groupService.resolveGroupName(report.ownerPhoneNumber, groupJid)) || undefined
    await report.save()
    return report
  },

  async markFailed(report: IncidentReport, groupJid?: string) {
    report.status = 'FAILED'
    report.forwardedGroupJid = groupJid
    await report.save()
    return report
  },

  async list(ownerPhoneNumber: string) {
    return IncidentReport.find({ where: { ownerPhoneNumber }, order: { receivedAt: 'DESC' }, take: 100 })
  },

  async findById(ownerPhoneNumber: string, id: string) {
    return IncidentReport.findOne({ where: { id, ownerPhoneNumber } })
  },

  async setReviewStatus(ownerPhoneNumber: string, id: string, reviewStatus: IncidentReport['reviewStatus']) {
    const report = await this.findById(ownerPhoneNumber, id)
    if (!report) {
      throw NotFound('Reporte no encontrado.')
    }

    report.reviewStatus = reviewStatus
    await report.save()
    return report
  },

  getOperationsGroupJid() {
    return config.OPERATIONS_GROUP_JID
  },
}