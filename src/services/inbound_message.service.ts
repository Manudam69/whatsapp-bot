import { ClientContact } from '@/entities/client_contact.entity'
import { InboundMessage } from '@/entities/inbound_message.entity'
import { ParsedIncidentReport } from './report_parser.service'
import { outboundMessageService } from './outbound_message.service'
import { botConfigurationService } from './bot_configuration.service'
import { groupService } from './group.service'
import { reportService, formatReportMessage } from './report.service'
import { whatsappIdentityService } from './whatsapp_identity.service'
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

// Acepta DD/MM/AAAA, DD-MM-AAAA o DD.MM.AAAA con años de 2 o 4 dígitos
const DATE_REGEX = /^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}$/

// Acepta HH:MM o HH:MM:SS (24 hrs)
const TIME_REGEX = /^\d{1,2}:\d{2}(:\d{2})?$/

const SERVICE_MIN_LENGTH = 2
const INCIDENT_MIN_LENGTH = 5

function isValidDate(value: string) {
  if (!DATE_REGEX.test(value)) {
    return false
  }
  const parts = value.split(/[\/\-\.]/).map(Number)
  const [day, month] = parts
  return day >= 1 && day <= 31 && month >= 1 && month <= 12
}

function isValidTime(value: string) {
  if (!TIME_REGEX.test(value)) {
    return false
  }
  const [hours, minutes] = value.split(':').map(Number)
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59
}

function fillTemplate(template: string, values: Record<string, string>) {
  return Object.entries(values).reduce((result, [key, value]) => result.split(`{{${key}}}`).join(value), template)
}

function normalizeFlow(_contact: ClientContact) {
  // No-op: AWAITING_REPORT is used as an intermediate state after startCapture
  // to discard messages sent before the user sees the Paso 1 prompt.
}

function resetDraft(contact: ClientContact) {
  contact.currentFlow = 'IDLE'
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
}

export const inboundMessageService = {
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

    const contact = await whatsappIdentityService.upsertContactFromInbound(
      input.sessionId,
      input.clientId,
      input.fromJid,
      input.authDirKey,
      input.contactName,
      input.rawPayload,
    )
    normalizeFlow(contact)

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

    // AWAITING_REPORT is an intermediate state set by startCapture().
    // Discard messages whose WhatsApp timestamp predates the startCapture call
    // (flood messages sent before the user sees Paso 1). Process messages sent
    // after startCapture (genuine replies to Paso 1) as AWAITING_SERVICE.
    if (contact.currentFlow === 'AWAITING_REPORT') {
      const msgTs =
        typeof input.rawPayload?.messageTimestamp === 'number'
          ? input.rawPayload.messageTimestamp * 1000
          : null
      if (msgTs !== null && msgTs > contact.updatedAt.getTime()) {
        contact.currentFlow = 'AWAITING_SERVICE'
      } else {
        contact.currentFlow = 'AWAITING_SERVICE'
        await contact.save()
        return
      }
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

    const report = await reportService.createFromInbound(contact, parsed, sourceMessage)
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
      resetDraft(contact)
      await contact.save()
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
      resetDraft(contact)
      await contact.save()
      if (settings.confirmationEnabled) {
        await outboundMessageService.queueText({
          sessionId,
          recipientJid: input.fromJid,
          text: fillTemplate(PROMPTS.confirmed, { folio: report.folio }),
          sourceType: 'FLOW_REPLY',
        })
      }
    }
  },
}
