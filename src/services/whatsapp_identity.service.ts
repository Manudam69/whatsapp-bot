import fs from 'fs'
import path from 'path'
import { ClientContact } from '@/entities/client_contact.entity'
import { InboundMessage } from '@/entities/inbound_message.entity'
import { AppDataSource } from '@/database/datasource'
import { config } from '@/config'
import logger from '@/utils/logger'
import { normalizePhoneNumber } from '@/utils/phone'

function readMappingValue(filePath: string) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8').trim()
    if (!raw) {
      return undefined
    }

    const parsed = JSON.parse(raw)
    return typeof parsed === 'string' ? normalizePhoneNumber(parsed) : undefined
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
  // Per auth-dir LID maps: authDirKey → { byLid, byPhone }
  private lidMaps = new Map<string, { byLid: Map<string, string>; byPhone: Map<string, string>; ready: boolean }>()

  private getOrCreateMap(authDirKey: string) {
    if (!this.lidMaps.has(authDirKey)) {
      this.lidMaps.set(authDirKey, { byLid: new Map(), byPhone: new Map(), ready: false })
    }
    return this.lidMaps.get(authDirKey)!
  }

  resolvePhoneNumberFromJid(jid: string, authDirKey?: string) {
    const [localPart, domain = ''] = jid.split('@')
    if (!localPart) {
      return ''
    }

    if (domain !== 'lid') {
      return normalizePhoneNumber(localPart)
    }

    if (!authDirKey) {
      return localPart
    }

    this.loadMappings(authDirKey)

    const map = this.getOrCreateMap(authDirKey)
    const resolved = map.byLid.get(localPart)
    if (resolved) {
      return resolved
    }

    this.loadMappings(authDirKey, true)
    return map.byLid.get(localPart) || localPart
  }

  async upsertContactFromInbound(
    sessionId: string,
    clientId: string,
    jid: string,
    authDirKey: string,
    contactName?: string,
    rawPayload?: Record<string, unknown>,
  ) {
    const phoneNumber = this.resolvePhoneNumber(jid, authDirKey, rawPayload)
    const existingByJid = await ClientContact.findOne({ where: { sessionId, whatsappJid: jid } })
    const existingByPhone = phoneNumber ? await ClientContact.findOne({ where: { sessionId, phoneNumber } }) : null

    if (existingByJid && existingByPhone && existingByJid.id !== existingByPhone.id) {
      return this.mergeContacts(existingByJid, existingByPhone, jid, phoneNumber, contactName)
    }

    const contact = existingByJid || existingByPhone
    if (contact) {
      contact.clientId = clientId
      contact.sessionId = sessionId
      contact.phoneNumber = phoneNumber
      contact.whatsappJid = jid
      contact.contactName = contactName || contact.contactName
      contact.lastInboundAt = new Date()
      await contact.save()
      return contact
    }

    const created = ClientContact.create({
      clientId,
      sessionId,
      phoneNumber,
      whatsappJid: jid,
      contactName,
      currentFlow: 'IDLE',
      lastInboundAt: new Date(),
    })

    await created.save()
    return created
  }

  async repairStoredContacts(sessionId: string, phoneNumber?: string | null) {
    if (!sessionId) {
      return 0
    }

    // Get authDirKey from DB for this session
    const { AppDataSource: ds } = await import('@/database/datasource')
    const rows = await ds.query<Array<{ auth_dir_key: string }>>(
      `SELECT "auth_dir_key" FROM "whatsapp_sessions" WHERE "id" = $1`,
      [sessionId],
    )
    const authDirKey = rows[0]?.auth_dir_key || sessionId

    const contacts = await ClientContact.find({ where: { sessionId } })
    let repairedCount = 0
    let unresolvedCount = 0

    for (const contact of contacts) {
      const resolvedPhoneNumber = await this.resolveStoredPhoneNumber(contact, authDirKey)
      if (!resolvedPhoneNumber || resolvedPhoneNumber === contact.phoneNumber) {
        if (contact.whatsappJid.endsWith('@lid') && getJidLocalPart(contact.whatsappJid) === contact.phoneNumber) {
          unresolvedCount += 1
        }

        continue
      }

      const duplicate = await ClientContact.findOne({ where: { sessionId, phoneNumber: resolvedPhoneNumber } })
      if (duplicate && duplicate.id !== contact.id) {
        await this.mergeContacts(contact, duplicate, contact.whatsappJid, resolvedPhoneNumber, contact.contactName)
      } else {
        contact.phoneNumber = resolvedPhoneNumber
        await contact.save()
      }

      repairedCount += 1
    }

    if (repairedCount > 0) {
      logger.info(`[Session ${sessionId}] Repaired ${repairedCount} WhatsApp contact phone number mappings.`)
    }

    if (unresolvedCount > 0) {
      logger.warn(`[Session ${sessionId}] Found ${unresolvedCount} WhatsApp contacts with unresolved LID mappings.`)
    }

    return repairedCount
  }

  private resolvePhoneNumber(jid: string, authDirKey: string, rawPayload?: Record<string, unknown>) {
    const resolvedFromJid = this.resolvePhoneNumberFromJid(jid, authDirKey)
    if (!jid.endsWith('@lid')) {
      return resolvedFromJid
    }

    const lid = getJidLocalPart(jid)
    if (resolvedFromJid && resolvedFromJid !== lid) {
      return resolvedFromJid
    }

    return this.resolvePhoneNumberFromPayload(rawPayload, authDirKey) || resolvedFromJid
  }

  private resolvePhoneNumberFromPayload(rawPayload: Record<string, unknown> | undefined, authDirKey: string) {
    if (!rawPayload) {
      return ''
    }

    const key = rawPayload.key
    const remoteJidAlt = getStringValue(key, 'remoteJidAlt')
    if (remoteJidAlt) {
      return this.resolvePhoneNumberFromJid(remoteJidAlt, authDirKey)
    }

    const participantAlt = getStringValue(key, 'participantAlt')
    if (participantAlt) {
      return this.resolvePhoneNumberFromJid(participantAlt, authDirKey)
    }

    return ''
  }

  private async resolveStoredPhoneNumber(contact: ClientContact, authDirKey: string) {
    const resolvedFromJid = this.resolvePhoneNumberFromJid(contact.whatsappJid, authDirKey)
    const lid = getJidLocalPart(contact.whatsappJid)

    if (!contact.whatsappJid.endsWith('@lid') || !resolvedFromJid || resolvedFromJid !== lid) {
      return resolvedFromJid
    }

    const latestInbound = await InboundMessage.createQueryBuilder('message')
      .where('message.contact_id = :contactId', { contactId: contact.id })
      .orderBy('message.received_at', 'DESC')
      .getOne()

    return this.resolvePhoneNumberFromPayload(latestInbound?.rawPayload, authDirKey) || resolvedFromJid
  }

  private loadMappings(authDirKey: string, forceReload = false) {
    const map = this.getOrCreateMap(authDirKey)
    if (map.ready && !forceReload) {
      return
    }

    map.byLid.clear()
    map.byPhone.clear()

    const authDir = path.resolve(process.cwd(), config.SESSION_AUTH_DIR, authDirKey)
    if (!fs.existsSync(authDir)) {
      map.ready = true
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
        const lid = normalizePhoneNumber(baseName.slice(0, -'_reverse'.length))
        const phone = value
        map.byLid.set(lid, phone)
        map.byPhone.set(phone, lid)
        continue
      }

      const phone = normalizePhoneNumber(baseName)
      const lid = value
      map.byPhone.set(phone, lid)
      map.byLid.set(lid, phone)
    }

    map.ready = true
  }

  private async mergeContacts(primary: ClientContact, secondary: ClientContact, jid: string, phoneNumber: string, contactName?: string) {
    await AppDataSource.transaction(async (manager) => {
      await manager.query('UPDATE inbound_messages SET contact_id = $1 WHERE contact_id = $2', [primary.id, secondary.id])
      await manager.query('UPDATE incident_reports SET contact_id = $1 WHERE contact_id = $2', [primary.id, secondary.id])

      primary.clientId = primary.clientId || secondary.clientId
      primary.sessionId = primary.sessionId || secondary.sessionId
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
