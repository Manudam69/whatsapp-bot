import { ClientContact } from '@/entities/client_contact.entity'
import { InboundMessage } from '@/entities/inbound_message.entity'
import { ParsedIncidentReport } from './report_parser.service'
import { reportService, formatReportMessage } from './report.service'
import { whatsappService } from './whatsapp.service'
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

function extractPhoneNumber(jid: string) {
  return jid.split('@')[0]
}

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
  await whatsappService.sendText(jid, INITIAL_PROMPT)
  await whatsappService.sendText(jid, PROMPTS.service)
}

async function findOrCreateContact(jid: string, contactName?: string) {
  const phoneNumber = extractPhoneNumber(jid)
  const existing = await ClientContact.findOne({ where: { whatsappJid: jid } })
  if (existing) {
    existing.phoneNumber = phoneNumber
    existing.contactName = contactName || existing.contactName
    existing.lastInboundAt = new Date()
    await existing.save()
    return existing
  }

  const contact = ClientContact.create({
    phoneNumber,
    whatsappJid: jid,
    contactName,
    currentFlow: 'IDLE',
    lastInboundAt: new Date(),
  })

  await contact.save()
  return contact
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

    const contact = await findOrCreateContact(input.fromJid, input.contactName)
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
      await whatsappService.sendText(input.fromJid, PROMPTS.cancelled)
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
      await whatsappService.sendText(input.fromJid, PROMPTS.date)
      return
    }

    if (contact.currentFlow === 'AWAITING_DATE') {
      contact.draftIncidentDate = trimmedText
      contact.currentFlow = 'AWAITING_TIME'
      await contact.save()
      await whatsappService.sendText(input.fromJid, PROMPTS.time)
      return
    }

    if (contact.currentFlow === 'AWAITING_TIME') {
      contact.draftIncidentTime = trimmedText
      contact.currentFlow = 'AWAITING_INCIDENT'
      await contact.save()
      await whatsappService.sendText(input.fromJid, PROMPTS.incident)
      return
    }

    if (contact.currentFlow === 'AWAITING_INCIDENT') {
      contact.draftIncidentText = trimmedText
      contact.currentFlow = 'AWAITING_CONFIRMATION'
      await contact.save()
      await whatsappService.sendText(input.fromJid, buildConfirmationMessage(contact))
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
      await whatsappService.sendText(input.fromJid, PROMPTS.restart)
      await whatsappService.sendText(input.fromJid, PROMPTS.service)
      return
    }

    if (normalizedConfirmation !== 'SI' && normalizedConfirmation !== 'SÍ') {
      await whatsappService.sendText(input.fromJid, PROMPTS.invalidConfirmation)
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

      await whatsappService.sendText(operationsGroupJid, formatReportMessage(report))
      await reportService.markForwarded(report, operationsGroupJid)
      resetDraft(contact)
      await contact.save()
      await whatsappService.sendText(input.fromJid, fillTemplate(PROMPTS.confirmed, { folio: report.folio }))
    } catch (error) {
      logger.error(`Failed to forward incident report ${report.folio}: ${error instanceof Error ? error.message : String(error)}`)
      await reportService.markFailed(report, operationsGroupJid || undefined)
      resetDraft(contact)
      await contact.save()
      await whatsappService.sendText(input.fromJid, fillTemplate(PROMPTS.confirmed, { folio: report.folio }))
    }
  },
}