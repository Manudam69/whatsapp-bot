import { ClientContact } from '@/entities/client_contact.entity'
import { InboundMessage } from '@/entities/inbound_message.entity'
import { ParsedIncidentReport } from './report_parser.service'
import { outboundMessageService } from './outbound_message.service'
import { reportService, formatReportMessage } from './report.service'
import { whatsappIdentityService } from './whatsapp_identity.service'
import logger from '@/utils/logger'

const INITIAL_PROMPT =
  '*ASISTENTE DE REPORTES*\n\nSe capturara la informacion *paso a paso*.\n\nSi deseas cancelar la captura, escribe *CANCELAR*.'
const CANCEL_COMMAND = 'CANCELAR'

const PROMPTS = {
  service: '*Paso 1 de 4*\n\nEscribe solo el *servicio*.',
  date: '*Paso 2 de 4*\n\nServicio registrado correctamente.\n\nEscribe solo la *fecha del reporte*.',
  time: '*Paso 3 de 4*\n\nFecha registrada correctamente.\n\nEscribe solo la *hora del reporte*.',
  incident: '*Paso 4 de 4*\n\nHora registrada correctamente.\n\nEscribe solo la *incidencia*.',
  confirm:
    '*Resumen del reporte*\n\n- *Servicio:* {{service}}\n- *Fecha:* {{date}}\n- *Hora:* {{time}}\n- *Incidencia:* {{incident}}\n\nResponde *SI* para confirmar o *NO* para capturar de nuevo.',
  confirmed: '*Reporte recibido*\n\nTu folio es: *{{folio}}*',
  cancelled: '*Captura cancelada*\n\nSi deseas generar un nuevo reporte, envia cualquier mensaje.',
  invalidConfirmation: '*Respuesta no valida*\n\nResponde *SI* para confirmar o *NO* para capturar de nuevo.',
  restart: '*Se reiniciara la captura del reporte.*\n\nVolvamos a comenzar.',
} as const

function fillTemplate(template: string, values: Record<string, string>) {
  return Object.entries(values).reduce((result, [key, value]) => result.split(`{{${key}}}`).join(value), template)
}

function normalizeFlow(contact: ClientContact) {
  if (contact.currentFlow === 'AWAITING_REPORT') {
    contact.currentFlow = 'AWAITING_SERVICE'
  }
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
  resetDraft(contact)
  contact.currentFlow = 'AWAITING_SERVICE'
  await contact.save()
  await outboundMessageService.queueText({ recipientJid: jid, text: INITIAL_PROMPT, sourceType: 'FLOW_REPLY' })
  await outboundMessageService.queueText({ recipientJid: jid, text: PROMPTS.service, sourceType: 'FLOW_REPLY' })
}

export const inboundMessageService = {
  async processIncomingText(input: {
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

    const contact = await whatsappIdentityService.upsertContactFromInbound(input.fromJid, input.contactName, input.rawPayload)
    normalizeFlow(contact)

    await InboundMessage.save({
      contact,
      externalMessageId: input.externalMessageId,
      fromJid: input.fromJid,
      body: trimmedText,
      messageType: 'text',
      receivedAt: new Date(),
      rawPayload: input.rawPayload,
    })

    if (trimmedText.toUpperCase() === CANCEL_COMMAND) {
      resetDraft(contact)
      await contact.save()
      await outboundMessageService.queueText({ recipientJid: input.fromJid, text: PROMPTS.cancelled, sourceType: 'FLOW_REPLY' })
      return
    }

    if (contact.currentFlow === 'IDLE') {
      await startCapture(contact, input.fromJid)
      return
    }

    if (contact.currentFlow === 'AWAITING_SERVICE') {
      contact.draftServiceName = trimmedText
      contact.currentFlow = 'AWAITING_DATE'
      await contact.save()
      await outboundMessageService.queueText({ recipientJid: input.fromJid, text: PROMPTS.date, sourceType: 'FLOW_REPLY' })
      return
    }

    if (contact.currentFlow === 'AWAITING_DATE') {
      contact.draftIncidentDate = trimmedText
      contact.currentFlow = 'AWAITING_TIME'
      await contact.save()
      await outboundMessageService.queueText({ recipientJid: input.fromJid, text: PROMPTS.time, sourceType: 'FLOW_REPLY' })
      return
    }

    if (contact.currentFlow === 'AWAITING_TIME') {
      contact.draftIncidentTime = trimmedText
      contact.currentFlow = 'AWAITING_INCIDENT'
      await contact.save()
      await outboundMessageService.queueText({ recipientJid: input.fromJid, text: PROMPTS.incident, sourceType: 'FLOW_REPLY' })
      return
    }

    if (contact.currentFlow === 'AWAITING_INCIDENT') {
      contact.draftIncidentText = trimmedText
      contact.currentFlow = 'AWAITING_CONFIRMATION'
      await contact.save()
      await outboundMessageService.queueText({ recipientJid: input.fromJid, text: buildConfirmationMessage(contact), sourceType: 'FLOW_REPLY' })
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
      await outboundMessageService.queueText({ recipientJid: input.fromJid, text: PROMPTS.restart, sourceType: 'FLOW_REPLY' })
      await outboundMessageService.queueText({ recipientJid: input.fromJid, text: PROMPTS.service, sourceType: 'FLOW_REPLY' })
      return
    }

    if (normalizedConfirmation !== 'SI' && normalizedConfirmation !== 'SÍ') {
      await outboundMessageService.queueText({ recipientJid: input.fromJid, text: PROMPTS.invalidConfirmation, sourceType: 'FLOW_REPLY' })
      return
    }

    const parsed = buildDraft(contact)
    const sourceMessage = `Servicio: ${parsed.serviceName} | Fecha: ${parsed.incidentDate} | Hora: ${parsed.incidentTime} | Incidencia: ${parsed.incidentText}`

    const report = await reportService.createFromInbound(contact, parsed, sourceMessage)
    const operationsGroupJid = reportService.getOperationsGroupJid()

    try {
      if (!operationsGroupJid) {
        throw new Error('OPERATIONS_GROUP_JID is not configured')
      }

      await reportService.markQueued(report, operationsGroupJid)
      await outboundMessageService.queueText({
        recipientJid: operationsGroupJid,
        text: formatReportMessage(report),
        sourceType: 'REPORT_FORWARD',
        sourceId: report.id,
        metadata: { groupJid: operationsGroupJid },
      })
      resetDraft(contact)
      await contact.save()
      await outboundMessageService.queueText({
        recipientJid: input.fromJid,
        text: fillTemplate(PROMPTS.confirmed, { folio: report.folio }),
        sourceType: 'FLOW_REPLY',
      })
    } catch (error) {
      logger.error(`Failed to forward incident report ${report.folio}: ${error instanceof Error ? error.message : String(error)}`)
      await reportService.markFailed(report, operationsGroupJid || undefined)
      resetDraft(contact)
      await contact.save()
      await outboundMessageService.queueText({
        recipientJid: input.fromJid,
        text: fillTemplate(PROMPTS.confirmed, { folio: report.folio }),
        sourceType: 'FLOW_REPLY',
      })
    }
  },
}