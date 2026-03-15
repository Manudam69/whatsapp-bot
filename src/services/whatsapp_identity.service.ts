import fs from 'fs'
import path from 'path'
import { ClientContact } from '@/entities/client_contact.entity'
import { InboundMessage } from '@/entities/inbound_message.entity'
import { AppDataSource } from '@/database/datasource'
import { config } from '@/config'
import logger from '@/utils/logger'

function normalizeNumericId(value: string) {
  const digits = value.replace(/\D/g, '')
  return digits || value.trim()
}

function readMappingValue(filePath: string) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8').trim()
    if (!raw) {
      return undefined
    }

    const parsed = JSON.parse(raw)
    return typeof parsed === 'string' ? normalizeNumericId(parsed) : undefined
  } catch (error) {
    logger.warn(`Failed to read WhatsApp LID mapping file ${path.basename(filePath)}: ${error instanceof Error ? error.message : String(error)}`)
    return undefined
  }
}

function getJidLocalPart(jid: string) {
  return jid.split('@')[0] || ''
}

function getStringValue(input: unknown, key: string) {
  if (!input || typeof input !== 'object') {
    return undefined
  }

  const value = (input as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : undefined
}

class WhatsappIdentityService {
  private byLid = new Map<string, string>()
  private byPhone = new Map<string, string>()
  private cacheReady = false

  resolvePhoneNumberFromJid(jid: string) {
    const [localPart, domain = ''] = jid.split('@')
    if (!localPart) {
      return ''
    }

    if (domain !== 'lid') {
      return normalizeNumericId(localPart)
    }

    this.loadMappings()

    const resolved = this.byLid.get(localPart)
    if (resolved) {
      return resolved
    }

    this.loadMappings(true)
    return this.byLid.get(localPart) || localPart
  }

  async upsertContactFromInbound(jid: string, contactName?: string, rawPayload?: Record<string, unknown>) {
    const phoneNumber = this.resolvePhoneNumber(jid, rawPayload)
    const existingByJid = await ClientContact.findOne({ where: { whatsappJid: jid } })
    const existingByPhone = phoneNumber ? await ClientContact.findOne({ where: { phoneNumber } }) : null

    if (existingByJid && existingByPhone && existingByJid.id !== existingByPhone.id) {
      return this.mergeContacts(existingByJid, existingByPhone, jid, phoneNumber, contactName)
    }

    const contact = existingByJid || existingByPhone
    if (contact) {
      contact.phoneNumber = phoneNumber
      contact.whatsappJid = jid
      contact.contactName = contactName || contact.contactName
      contact.lastInboundAt = new Date()
      await contact.save()
      return contact
    }

    const created = ClientContact.create({
      phoneNumber,
      whatsappJid: jid,
      contactName,
      currentFlow: 'IDLE',
      lastInboundAt: new Date(),
    })

    await created.save()
    return created
  }

  async repairStoredContacts() {
    const contacts = await ClientContact.find()
    let repairedCount = 0
    let unresolvedCount = 0

    for (const contact of contacts) {
      const resolvedPhoneNumber = await this.resolveStoredPhoneNumber(contact)
      if (!resolvedPhoneNumber || resolvedPhoneNumber === contact.phoneNumber) {
        if (contact.whatsappJid.endsWith('@lid') && getJidLocalPart(contact.whatsappJid) === contact.phoneNumber) {
          unresolvedCount += 1
        }

        continue
      }

      const duplicate = await ClientContact.findOne({ where: { phoneNumber: resolvedPhoneNumber } })
      if (duplicate && duplicate.id !== contact.id) {
        await this.mergeContacts(contact, duplicate, contact.whatsappJid, resolvedPhoneNumber, contact.contactName)
      } else {
        contact.phoneNumber = resolvedPhoneNumber
        await contact.save()
      }

      repairedCount += 1
    }

    if (repairedCount > 0) {
      logger.info(`Repaired ${repairedCount} WhatsApp contact phone number mappings.`)
    }

    if (unresolvedCount > 0) {
      logger.warn(`Found ${unresolvedCount} WhatsApp contacts with unresolved LID mappings.`)
    }

    return repairedCount
  }

  private resolvePhoneNumber(jid: string, rawPayload?: Record<string, unknown>) {
    const resolvedFromJid = this.resolvePhoneNumberFromJid(jid)
    if (!jid.endsWith('@lid')) {
      return resolvedFromJid
    }

    const lid = getJidLocalPart(jid)
    if (resolvedFromJid && resolvedFromJid !== lid) {
      return resolvedFromJid
    }

    return this.resolvePhoneNumberFromPayload(rawPayload) || resolvedFromJid
  }

  private resolvePhoneNumberFromPayload(rawPayload?: Record<string, unknown>) {
    if (!rawPayload) {
      return ''
    }

    const key = rawPayload.key
    const remoteJidAlt = getStringValue(key, 'remoteJidAlt')
    if (remoteJidAlt) {
      return this.resolvePhoneNumberFromJid(remoteJidAlt)
    }

    const participantAlt = getStringValue(key, 'participantAlt')
    if (participantAlt) {
      return this.resolvePhoneNumberFromJid(participantAlt)
    }

    return ''
  }

  private async resolveStoredPhoneNumber(contact: ClientContact) {
    const resolvedFromJid = this.resolvePhoneNumberFromJid(contact.whatsappJid)
    const lid = getJidLocalPart(contact.whatsappJid)

    if (!contact.whatsappJid.endsWith('@lid') || !resolvedFromJid || resolvedFromJid !== lid) {
      return resolvedFromJid
    }

    const latestInbound = await InboundMessage.createQueryBuilder('message')
      .where('message.contact_id = :contactId', { contactId: contact.id })
      .orderBy('message.received_at', 'DESC')
      .getOne()

    return this.resolvePhoneNumberFromPayload(latestInbound?.rawPayload) || resolvedFromJid
  }

  private loadMappings(forceReload = false) {
    if (this.cacheReady && !forceReload) {
      return
    }

    this.byLid.clear()
    this.byPhone.clear()

    const authDir = path.resolve(process.cwd(), config.SESSION_AUTH_DIR)
    if (!fs.existsSync(authDir)) {
      this.cacheReady = true
      return
    }

    const entries = fs.readdirSync(authDir).filter((entry) => entry.startsWith('lid-mapping-') && entry.endsWith('.json'))
    for (const entry of entries) {
      const filePath = path.join(authDir, entry)
      const baseName = entry.slice('lid-mapping-'.length, -'.json'.length)
      const value = readMappingValue(filePath)
      if (!value) {
        continue
      }

      if (baseName.endsWith('_reverse')) {
        const lid = normalizeNumericId(baseName.slice(0, -'_reverse'.length))
        const phone = value
        this.byLid.set(lid, phone)
        this.byPhone.set(phone, lid)
        continue
      }

      const phone = normalizeNumericId(baseName)
      const lid = value
      this.byPhone.set(phone, lid)
      this.byLid.set(lid, phone)
    }

    this.cacheReady = true
  }

  private async mergeContacts(primary: ClientContact, secondary: ClientContact, jid: string, phoneNumber: string, contactName?: string) {
    await AppDataSource.transaction(async (manager) => {
      await manager.query('UPDATE inbound_messages SET contact_id = $1 WHERE contact_id = $2', [primary.id, secondary.id])
      await manager.query('UPDATE incident_reports SET contact_id = $1 WHERE contact_id = $2', [primary.id, secondary.id])

      primary.phoneNumber = phoneNumber
      primary.whatsappJid = jid
      primary.contactName = contactName || primary.contactName || secondary.contactName
      primary.lastInboundAt = this.pickLatestDate(primary.lastInboundAt, secondary.lastInboundAt)
      primary.lastReportAt = this.pickLatestDate(primary.lastReportAt, secondary.lastReportAt)
      primary.currentFlow = primary.currentFlow === 'IDLE' ? secondary.currentFlow : primary.currentFlow
      primary.draftServiceName = primary.draftServiceName || secondary.draftServiceName
      primary.draftIncidentDate = primary.draftIncidentDate || secondary.draftIncidentDate
      primary.draftIncidentTime = primary.draftIncidentTime || secondary.draftIncidentTime
      primary.draftIncidentText = primary.draftIncidentText || secondary.draftIncidentText

      await manager.getRepository(ClientContact).save(primary)
      await manager.getRepository(ClientContact).delete({ id: secondary.id })
    })

    return primary
  }

  private pickLatestDate(first?: Date, second?: Date) {
    if (!first) {
      return second
    }

    if (!second) {
      return first
    }

    return first >= second ? first : second
  }
}

export const whatsappIdentityService = new WhatsappIdentityService()