import { MoreThan } from 'typeorm'
import { ClientContact } from '@/entities/client_contact.entity'
import { IncidentReport } from '@/entities/incident_report.entity'
import { InboundMessage } from '@/entities/inbound_message.entity'
import { OutboundMessage } from '@/entities/outbound_message.entity'
import { AppDataSource } from '@/database/datasource'
import { ParsedIncidentReport } from './report_parser.service'
import { outboundMessageService } from './outbound_message.service'
import { botConfigurationService } from './bot_configuration.service'
import { groupService } from './group.service'
import { reportService, formatReportMessage, buildFolio } from './report.service'
import { whatsappIdentityService } from './whatsapp_identity.service'
import { sseService } from './sse.service'
import { isValidDate, isValidTime } from '@/utils/validators'
import logger from '@/utils/logger'

const INITIAL_PROMPT =
  '*ASISTENTE DE REPORTES*\n\nSe capturara la informacion *paso a paso*.\n\nSi deseas cancelar la captura, escribe *CANCELAR*.'
const CANCEL_COMMAND = 'CANCELAR'

const PROMPTS = {
  service: '*Paso 1 de 4*\n\nEscribe solo el nombre del *servicio* de donde nos contacta.',
  date: '*Paso 2 de 4*\n\nServicio registrado correctamente.\n\nEscribe solo la *fecha del reporte*.\nFormato: _DD/MM/AAAA_ (ejemplo: _15/03/2024_)',
  time: '*Paso 3 de 4*\n\nFecha registrada correctamente.\n\nEscribe solo la *hora del reporte*.\nFormato: _HH:MM_ en 24 hrs (ejemplo: _14:30_)',
  incident: '*Paso 4 de 4*\n\nHora registrada correctamente.\n\nEscribe solo la *incidencia*.',
  confirm:
    '*Resumen del reporte*\n\n- *Servicio:* {{service}}\n- *Fecha:* {{date}}\n- *Hora:* {{time}}\n- *Incidencia:* {{incident}}\n\nResponde *SI* para confirmar o *NO* para capturar de nuevo.',
  confirmed: '*Reporte recibido*\n\nTu folio es: *{{folio}}*',
  cancelled: '*Captura cancelada*\n\nSi deseas generar un nuevo reporte, envia cualquier mensaje.',
  invalidConfirmation: '*Respuesta no valida*\n\nResponde *SI* para confirmar o *NO* para capturar de nuevo.',
  restart: '*Se reiniciara la captura del reporte.*\n\nVolvamos a comenzar.',
  invalidService: '*El nombre del servicio no es valido.*\n\nDebe tener al menos 2 caracteres.\n\nEscribe nuevamente el *servicio*.',
  invalidIncident: '*La descripcion de la incidencia es muy corta.*\n\nEscribe nuevamente la *incidencia* con mas detalle.',
} as const

// Multiple variants for repeated validation errors to avoid identical messages.
const INVALID_DATE_VARIANTS = [
  '*Formato de fecha no valido.*\n\nEscribe la fecha en formato *DD/MM/AAAA*\nEjemplo: _15/03/2024_',
  '*No reconoci ese formato.*\n\nUsa *DD/MM/AAAA*, por ejemplo: _15/03/2024_',
  '*Fecha no reconocida.*\n\nEl formato esperado es *DD/MM/AAAA*\nEjemplo: _15/03/2024_',
]

const INVALID_TIME_VARIANTS = [
  '*Formato de hora no valido.*\n\nEscribe la hora en formato *HH:MM* en 24 hrs\nEjemplo: _14:30_',
  '*No reconoci ese formato de hora.*\n\nUsa *HH:MM* en 24 hrs, por ejemplo: _14:30_',
  '*Hora no reconocida.*\n\nEl formato esperado es *HH:MM*\nEjemplo: _14:30_',
]

function pickVariant(variants: readonly string[]): string {
  return variants[Math.floor(Math.random() * variants.length)]!
}

const SERVICE_MIN_LENGTH = 2
const INCIDENT_MIN_LENGTH = 5

function fillTemplate(template: string, values: Record<string, string>) {
  return Object.entries(values).reduce((result, [key, value]) => result.split(`{{${key}}}`).join(value), template)
}

function getMessageTimestamp(rawPayload?: Record<string, unknown>) {
  const rawTs = rawPayload?.messageTimestamp
  if (typeof rawTs === 'number') {
    return rawTs * 1000
  }

  if (rawTs != null && typeof (rawTs as { toNumber?: () => number }).toNumber === 'function') {
    return (rawTs as { toNumber: () => number }).toNumber() * 1000
  }

  return null
}

function normalizeFlow(contact: ClientContact) {
  if (contact.currentFlow === 'AWAITING_REPORT' && !contact.reportFlowStartedAt) {
    contact.currentFlow = 'AWAITING_SERVICE'
  }
}

function resetDraft(contact: ClientContact) {
  contact.currentFlow = 'IDLE'
  contact.reportFlowStartedAt = null as unknown as undefined
  contact.draftServiceName = null as unknown as undefined
  contact.draftIncidentDate = null as unknown as undefined
  contact.draftIncidentTime = null as unknown as undefined
  contact.draftIncidentText = null as unknown as undefined
}

function buildDraft(contact: ClientContact): ParsedIncidentReport {
  return {
    serviceName: contact.draftServiceName || '',
    incidentDate: contact.draftIncidentDate || '',
    incidentTime: contact.draftIncidentTime || '',
    incidentText: contact.draftIncidentText || '',
  }
}

function buildConfirmationMessage(contact: ClientContact) {
  return fillTemplate(PROMPTS.confirm, {
    service: contact.draftServiceName || '',
    date: contact.draftIncidentDate || '',
    time: contact.draftIncidentTime || '',
    incident: contact.draftIncidentText || '',
  })
}

async function startCapture(contact: ClientContact, jid: string) {
  const settings = await botConfigurationService.get(contact.clientId, contact.sessionId)
  resetDraft(contact)
  contact.currentFlow = 'AWAITING_REPORT'
  contact.reportFlowStartedAt = new Date()
  await contact.save()
  if (settings.firstReplyEnabled) {
    await outboundMessageService.queueText({
      sessionId: contact.sessionId,
      recipientJid: jid,
      text: settings.firstReplyText?.trim() || INITIAL_PROMPT,
      sourceType: 'FLOW_REPLY',
    })
  } else {
    await outboundMessageService.queueText({ sessionId: contact.sessionId, recipientJid: jid, text: INITIAL_PROMPT, sourceType: 'FLOW_REPLY' })
  }
  await outboundMessageService.queueText({ sessionId: contact.sessionId, recipientJid: jid, text: PROMPTS.service, sourceType: 'FLOW_REPLY' })
  contact.currentFlow = 'AWAITING_SERVICE'
  await contact.save()
}

async function findLatestServicePrompt(contact: ClientContact, jid: string) {
  if (!contact.reportFlowStartedAt) {
    return null
  }

  return OutboundMessage.findOne({
    where: {
      sessionId: contact.sessionId,
      recipientJid: jid,
      sourceType: 'FLOW_REPLY',
      status: 'SENT',
      messageType: 'TEXT',
      messageText: PROMPTS.service,
      createdAt: MoreThan(contact.reportFlowStartedAt),
    },
    order: { createdAt: 'DESC' },
  })
}

async function processTextForContact(contact: ClientContact, input: {
  sessionId: string
  clientId: string
  fromJid: string
  text: string
  rawPayload?: Record<string, unknown>
}) {
  const trimmedText = input.text.trim()
  if (!trimmedText) {
    return
  }

  normalizeFlow(contact)

  const { sessionId, clientId } = input

  if (trimmedText.toUpperCase() === CANCEL_COMMAND) {
    resetDraft(contact)
    await contact.save()
    await outboundMessageService.queueText({ sessionId, recipientJid: input.fromJid, text: PROMPTS.cancelled, sourceType: 'FLOW_REPLY' })
    return
  }

  if (contact.currentFlow === 'IDLE') {
    await startCapture(contact, input.fromJid)
    return
  }

  if (contact.currentFlow === 'AWAITING_REPORT') {
    const servicePrompt = await findLatestServicePrompt(contact, input.fromJid)
    const messageTimestamp = getMessageTimestamp(input.rawPayload)

    if (!servicePrompt?.sentAt) {
      return
    }

    if (messageTimestamp !== null && messageTimestamp <= servicePrompt.sentAt.getTime()) {
      return
    }

    contact.currentFlow = 'AWAITING_SERVICE'
    await contact.save()
  }

  if (contact.currentFlow === 'AWAITING_SERVICE') {
    if (trimmedText.length < SERVICE_MIN_LENGTH) {
      await outboundMessageService.queueText({ sessionId, recipientJid: input.fromJid, text: PROMPTS.invalidService, sourceType: 'FLOW_REPLY' })
      return
    }
    contact.draftServiceName = trimmedText
    contact.currentFlow = 'AWAITING_DATE'
    await contact.save()
    await outboundMessageService.queueText({ sessionId, recipientJid: input.fromJid, text: PROMPTS.date, sourceType: 'FLOW_REPLY' })
    return
  }

  if (contact.currentFlow === 'AWAITING_DATE') {
    if (!isValidDate(trimmedText)) {
      await outboundMessageService.queueText({ sessionId, recipientJid: input.fromJid, text: pickVariant(INVALID_DATE_VARIANTS), sourceType: 'FLOW_REPLY' })
      return
    }
    contact.draftIncidentDate = trimmedText
    contact.currentFlow = 'AWAITING_TIME'
    await contact.save()
    await outboundMessageService.queueText({ sessionId, recipientJid: input.fromJid, text: PROMPTS.time, sourceType: 'FLOW_REPLY' })
    return
  }

  if (contact.currentFlow === 'AWAITING_TIME') {
    if (!isValidTime(trimmedText)) {
      await outboundMessageService.queueText({ sessionId, recipientJid: input.fromJid, text: pickVariant(INVALID_TIME_VARIANTS), sourceType: 'FLOW_REPLY' })
      return
    }
    contact.draftIncidentTime = trimmedText
    contact.currentFlow = 'AWAITING_INCIDENT'
    await contact.save()
    await outboundMessageService.queueText({ sessionId, recipientJid: input.fromJid, text: PROMPTS.incident, sourceType: 'FLOW_REPLY' })
    return
  }

  if (contact.currentFlow === 'AWAITING_INCIDENT') {
    if (trimmedText.length < INCIDENT_MIN_LENGTH) {
      await outboundMessageService.queueText({ sessionId, recipientJid: input.fromJid, text: PROMPTS.invalidIncident, sourceType: 'FLOW_REPLY' })
      return
    }
    contact.draftIncidentText = trimmedText
    contact.currentFlow = 'AWAITING_CONFIRMATION'
    await contact.save()
    await outboundMessageService.queueText({ sessionId, recipientJid: input.fromJid, text: buildConfirmationMessage(contact), sourceType: 'FLOW_REPLY' })
    return
  }

  if (contact.currentFlow !== 'AWAITING_CONFIRMATION') {
    await startCapture(contact, input.fromJid)
    return
  }

  const normalizedConfirmation = trimmedText.toUpperCase()
  if (normalizedConfirmation === 'NO') {
    contact.currentFlow = 'AWAITING_SERVICE'
    contact.draftServiceName = undefined
    contact.draftIncidentDate = undefined
    contact.draftIncidentTime = undefined
    contact.draftIncidentText = undefined
    await contact.save()
    await outboundMessageService.queueText({ sessionId, recipientJid: input.fromJid, text: PROMPTS.restart, sourceType: 'FLOW_REPLY' })
    await outboundMessageService.queueText({ sessionId, recipientJid: input.fromJid, text: PROMPTS.service, sourceType: 'FLOW_REPLY' })
    return
  }

  if (normalizedConfirmation !== 'SI' && normalizedConfirmation !== 'SÍ') {
    await outboundMessageService.queueText({ sessionId, recipientJid: input.fromJid, text: PROMPTS.invalidConfirmation, sourceType: 'FLOW_REPLY' })
    return
  }

  const parsed = buildDraft(contact)
  const sourceMessage = `Servicio: ${parsed.serviceName} | Fecha: ${parsed.incidentDate} | Hora: ${parsed.incidentTime} | Incidencia: ${parsed.incidentText}`

  // Atomically create the report and reset the contact draft in a single transaction.
  // This guarantees the contact is never left stuck in AWAITING_CONFIRMATION if the
  // process crashes between the two operations.
  let report: IncidentReport
  try {
    report = await AppDataSource.transaction(async (manager) => {
      const newReport = manager.create(IncidentReport, {
        clientId: contact.clientId,
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
      await manager.save(newReport)

      contact.lastReportAt = new Date()
      resetDraft(contact)
      await manager.save(contact)

      return newReport
    })
  } catch (txError) {
    logger.error(`Failed to create incident report (transaction rolled back): ${txError instanceof Error ? txError.message : String(txError)}`)
    return
  }

  sseService.emit(contact.clientId, 'report:created', { id: report.id })
  sseService.emit(contact.clientId, 'dashboard:refresh')

  const settings = await botConfigurationService.get(clientId, sessionId)
  const configuredOperationsGroupJid = settings.operationalGroupId || reportService.getOperationsGroupJid()
  const operationsGroupJid = configuredOperationsGroupJid
    ? await groupService.resolveGroupJid(sessionId, configuredOperationsGroupJid, { activeOnly: true })
    : null

  try {
    if (!operationsGroupJid) {
      throw new Error('OPERATIONS_GROUP_JID is not configured')
    }

    await reportService.markQueued(report, operationsGroupJid)
    await outboundMessageService.queueText({
      sessionId,
      recipientJid: operationsGroupJid,
      text: formatReportMessage(report),
      sourceType: 'REPORT_FORWARD',
      sourceId: report.id,
      metadata: { groupJid: operationsGroupJid },
    })
    if (settings.confirmationEnabled) {
      await outboundMessageService.queueText({
        sessionId,
        recipientJid: input.fromJid,
        text: fillTemplate(PROMPTS.confirmed, { folio: report.folio }),
        sourceType: 'FLOW_REPLY',
      })
    }
  } catch (error) {
    logger.error(`Failed to forward incident report ${report.folio}: ${error instanceof Error ? error.message : String(error)}`)
    await reportService.markFailed(report, operationsGroupJid || undefined)
    if (settings.confirmationEnabled) {
      await outboundMessageService.queueText({
        sessionId,
        recipientJid: input.fromJid,
        text: fillTemplate(PROMPTS.confirmed, { folio: report.folio }),
        sourceType: 'FLOW_REPLY',
      })
    }
  }
}

type InboundMessageServiceDeps = {
  outbound: typeof outboundMessageService
  botConfig: typeof botConfigurationService
  groups: typeof groupService
  reports: typeof reportService
  identity: typeof whatsappIdentityService
  sse: typeof sseService
}

export class InboundMessageService {
  constructor(private readonly deps: InboundMessageServiceDeps) {}

  async processIncomingText(input: {
    sessionId: string
    clientId: string
    authDirKey: string
    fromJid: string
    text: string
    externalMessageId?: string
    contactName?: string
    rawPayload?: Record<string, unknown>
  }) {
    const trimmedText = input.text.trim()
    if (!trimmedText) {
      return
    }

    if (input.externalMessageId) {
      const existingMessage = await InboundMessage.findOne({ where: { externalMessageId: input.externalMessageId } })
      if (existingMessage) {
        return
      }
    }

    const contact = await this.deps.identity.upsertContactFromInbound(
      input.sessionId,
      input.clientId,
      input.fromJid,
      input.authDirKey,
      input.contactName,
      input.rawPayload,
    )

    await InboundMessage.save({
      sessionId: input.sessionId,
      contact,
      externalMessageId: input.externalMessageId,
      fromJid: input.fromJid,
      body: trimmedText,
      messageType: 'text',
      receivedAt: new Date(),
      rawPayload: input.rawPayload,
    })

    await processTextForContact(contact, {
      sessionId: input.sessionId,
      clientId: input.clientId,
      fromJid: input.fromJid,
      text: trimmedText,
      rawPayload: input.rawPayload,
    })
  }

  async replayStoredMessage(message: InboundMessage) {
    const contact = message.contact
    await processTextForContact(contact, {
      sessionId: message.sessionId,
      clientId: contact.clientId,
      fromJid: message.fromJid,
      text: message.body,
      rawPayload: message.rawPayload,
    })
  }
}

// Singleton wired with concrete dependencies — swap deps here for testing
export const inboundMessageService = new InboundMessageService({
  outbound: outboundMessageService,
  botConfig: botConfigurationService,
  groups: groupService,
  reports: reportService,
  identity: whatsappIdentityService,
  sse: sseService,
})
