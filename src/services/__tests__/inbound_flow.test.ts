/**
 * Tests for the InboundMessageService state machine.
 *
 * All external I/O (DB, WhatsApp, SSE) is mocked so these are pure unit tests
 * that run in milliseconds with no infrastructure required.
 *
 * IMPORTANT: jest.mock() is hoisted by Jest's transform above ALL variable
 * declarations. Any const/let defined outside a factory would be undefined when
 * the factory runs. Pattern used here: define jest.fn() inside the factory,
 * then retrieve typed references via jest.mocked() after the imports.
 */

// ─── Module mocks ─────────────────────────────────────────────────────────────

jest.mock('@/services/outbound_message.service', () => ({
  outboundMessageService: {
    queueText: jest.fn().mockResolvedValue(undefined),
    queueMedia: jest.fn().mockResolvedValue(undefined),
  },
}))

jest.mock('@/services/bot_configuration.service', () => ({
  botConfigurationService: {
    get: jest.fn().mockResolvedValue({
      firstReplyEnabled: false,
      firstReplyText: '',
      confirmationEnabled: true,
      operationalGroupId: 'ops-group@g.us',
    }),
  },
}))

jest.mock('@/services/group.service', () => ({
  groupService: {
    resolveGroupJid: jest.fn().mockResolvedValue('ops-group@g.us'),
    resolveGroupName: jest.fn().mockResolvedValue('Ops'),
  },
}))

jest.mock('@/services/report.service', () => ({
  reportService: {
    markQueued: jest.fn().mockResolvedValue(undefined),
    markFailed: jest.fn().mockResolvedValue(undefined),
    getOperationsGroupJid: jest.fn().mockReturnValue('ops-group@g.us'),
  },
  formatReportMessage: jest.fn().mockReturnValue('FORMATTED REPORT'),
  buildFolio: jest.fn().mockReturnValue('REP-20240101-1234'),
}))

jest.mock('@/services/sse.service', () => ({
  sseService: { emit: jest.fn() },
}))

jest.mock('@/services/whatsapp_identity.service', () => ({
  whatsappIdentityService: {
    upsertContactFromInbound: jest.fn(),
  },
}))

jest.mock('@/entities/inbound_message.entity', () => ({
  InboundMessage: {
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn().mockResolvedValue({}),
  },
}))

jest.mock('@/entities/outbound_message.entity', () => ({
  OutboundMessage: {
    findOne: jest.fn().mockResolvedValue(null),
  },
}))

jest.mock('@/database/datasource', () => ({
  AppDataSource: {
    transaction: jest.fn().mockImplementation(async (fn: (m: unknown) => unknown) => {
      const fakeReport = { id: 'report-1', folio: 'REP-20240101-1234', contact: {} }
      return fn({
        create: jest.fn().mockReturnValue(fakeReport),
        save: jest.fn().mockResolvedValue(undefined),
      })
    }),
  },
}))

jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}))

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { InboundMessageService } from '../inbound_message.service'
import { outboundMessageService } from '@/services/outbound_message.service'
import { botConfigurationService } from '@/services/bot_configuration.service'
import { groupService } from '@/services/group.service'
import { reportService } from '@/services/report.service'
import { whatsappIdentityService } from '@/services/whatsapp_identity.service'
import { sseService } from '@/services/sse.service'
import { InboundMessage } from '@/entities/inbound_message.entity'
import { AppDataSource } from '@/database/datasource'

// Typed mock references — these reference the SAME objects returned by jest.mock factories above
const mockQueueText = jest.mocked(outboundMessageService.queueText)
const mockUpsertContact = jest.mocked(whatsappIdentityService.upsertContactFromInbound)
const mockMarkQueued = jest.mocked(reportService.markQueued)
const mockMarkFailed = jest.mocked(reportService.markFailed)
const mockGetOperationsGroupJid = jest.mocked(reportService.getOperationsGroupJid)
const mockResolveGroupJid = jest.mocked(groupService.resolveGroupJid)
const mockSseEmit = jest.mocked(sseService.emit)
const mockTransaction = jest.mocked(AppDataSource.transaction)
const mockBotConfigGet = jest.mocked(botConfigurationService.get)
const mockFindOne = jest.mocked(InboundMessage.findOne)

// ─── Helpers ──────────────────────────────────────────────────────────────────

type FlowState = 'IDLE' | 'AWAITING_REPORT' | 'AWAITING_SERVICE' | 'AWAITING_DATE'
  | 'AWAITING_TIME' | 'AWAITING_INCIDENT' | 'AWAITING_CONFIRMATION'

function makeContact(flow: FlowState = 'IDLE', overrides: Record<string, unknown> = {}) {
  return {
    id: 'contact-1',
    clientId: 'client-1',
    sessionId: 'session-1',
    whatsappJid: '521234567890@s.whatsapp.net',
    phoneNumber: '1234567890',
    contactName: 'Test User',
    currentFlow: flow,
    draftServiceName: null as string | null,
    draftIncidentDate: null as string | null,
    draftIncidentTime: null as string | null,
    draftIncidentText: null as string | null,
    reportFlowStartedAt: null as Date | null,
    lastReportAt: null as Date | null,
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

function makeService() {
  return new InboundMessageService({
    outbound: outboundMessageService,
    botConfig: botConfigurationService,
    groups: groupService,
    reports: reportService,
    identity: whatsappIdentityService,
    sse: sseService,
  })
}

const INPUT_BASE = {
  sessionId: 'session-1',
  clientId: 'client-1',
  authDirKey: 'auth-dir',
  fromJid: '521234567890@s.whatsapp.net',
}

async function send(service: InboundMessageService, contact: ReturnType<typeof makeContact>, text: string) {
  mockUpsertContact.mockResolvedValueOnce(contact as never)
  await service.processIncomingText({ ...INPUT_BASE, text })
}

function queuedTexts(): string[] {
  return mockQueueText.mock.calls.map((c) => (c[0] as { text: string }).text)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('InboundMessageService — state machine', () => {
  let service: InboundMessageService

  beforeEach(() => {
    service = makeService()
    // Reset upsertContact so stale Once impls from tests that trigger an early
    // return (before upsertContactFromInbound is called) don't bleed through.
    mockUpsertContact.mockReset()
    // Re-apply defaults that clearMocks would have removed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockBotConfigGet.mockResolvedValue({
      firstReplyEnabled: false,
      firstReplyText: '',
      confirmationEnabled: true,
      operationalGroupId: 'ops-group@g.us',
    } as never)
    mockResolveGroupJid.mockResolvedValue('ops-group@g.us')
    mockMarkQueued.mockResolvedValue(undefined as never)
    mockMarkFailed.mockResolvedValue(undefined as never)
    mockGetOperationsGroupJid.mockReturnValue('ops-group@g.us')
    mockFindOne.mockResolvedValue(null as never)
    // Restore transaction to default behavior
    mockTransaction.mockImplementation(async (fn: unknown) => {
      const fakeReport = { id: 'report-1', folio: 'REP-20240101-1234', contact: {} }
      return (fn as (m: unknown) => unknown)({
        create: jest.fn().mockReturnValue(fakeReport),
        save: jest.fn().mockResolvedValue(undefined),
      })
    })
  })

  // ── IDLE ──────────────────────────────────────────────────────────────────

  describe('IDLE state', () => {
    it('starts the capture flow on any non-empty message', async () => {
      const contact = makeContact('IDLE')
      await send(service, contact, 'hola')
      expect(queuedTexts().some((t) => t.includes('Paso 1 de 4'))).toBe(true)
    })

    it('ignores empty/whitespace messages', async () => {
      // Call directly — processIncomingText returns before upsertContact is called,
      // so we must not use send() which would leave a stale mockResolvedValueOnce.
      await service.processIncomingText({ ...INPUT_BASE, text: '   ' })
      expect(mockQueueText).not.toHaveBeenCalled()
    })
  })

  // ── CANCELLATION ──────────────────────────────────────────────────────────

  describe('CANCELAR command', () => {
    it.each(['CANCELAR', 'cancelar', 'Cancelar'])('cancels from AWAITING_SERVICE with "%s"', async (cmd) => {
      const contact = makeContact('AWAITING_SERVICE')
      await send(service, contact, cmd)
      expect(queuedTexts().some((t) => t.toLowerCase().includes('cancelad'))).toBe(true)
    })

    it('resets all draft fields on cancellation', async () => {
      const contact = makeContact('AWAITING_DATE', { draftServiceName: 'Agua' })
      await send(service, contact, 'CANCELAR')
      expect(contact.currentFlow).toBe('IDLE')
      expect(contact.draftServiceName).toBeNull()
    })
  })

  // ── AWAITING_SERVICE ──────────────────────────────────────────────────────

  describe('AWAITING_SERVICE state', () => {
    it('rejects a service name shorter than 2 characters', async () => {
      const contact = makeContact('AWAITING_SERVICE')
      await send(service, contact, 'A')
      expect(queuedTexts().some((t) => t.toLowerCase().includes('valido'))).toBe(true)
      expect(contact.currentFlow).toBe('AWAITING_SERVICE')
    })

    it('accepts a valid service name and advances to AWAITING_DATE', async () => {
      const contact = makeContact('AWAITING_SERVICE')
      await send(service, contact, 'Agua Potable')
      expect(contact.draftServiceName).toBe('Agua Potable')
      expect(contact.currentFlow).toBe('AWAITING_DATE')
      expect(queuedTexts().some((t) => t.includes('Paso 2 de 4'))).toBe(true)
    })
  })

  // ── AWAITING_DATE ─────────────────────────────────────────────────────────

  describe('AWAITING_DATE state', () => {
    it('rejects a non-date string', async () => {
      const contact = makeContact('AWAITING_DATE', { draftServiceName: 'Agua' })
      await send(service, contact, 'hoy')
      expect(contact.currentFlow).toBe('AWAITING_DATE')
    })

    it('rejects a calendrically invalid date (Feb 30)', async () => {
      const contact = makeContact('AWAITING_DATE', { draftServiceName: 'Agua' })
      await send(service, contact, '30/02/2024')
      expect(contact.currentFlow).toBe('AWAITING_DATE')
    })

    it('accepts a valid date and advances to AWAITING_TIME', async () => {
      const contact = makeContact('AWAITING_DATE', { draftServiceName: 'Agua' })
      await send(service, contact, '15/03/2024')
      expect(contact.draftIncidentDate).toBe('15/03/2024')
      expect(contact.currentFlow).toBe('AWAITING_TIME')
    })
  })

  // ── AWAITING_TIME ─────────────────────────────────────────────────────────

  describe('AWAITING_TIME state', () => {
    it('rejects hour 24:00', async () => {
      const contact = makeContact('AWAITING_TIME', { draftServiceName: 'Agua', draftIncidentDate: '15/03/2024' })
      await send(service, contact, '24:00')
      expect(contact.currentFlow).toBe('AWAITING_TIME')
    })

    it('accepts a valid time and advances to AWAITING_INCIDENT', async () => {
      const contact = makeContact('AWAITING_TIME', { draftServiceName: 'Agua', draftIncidentDate: '15/03/2024' })
      await send(service, contact, '14:30')
      expect(contact.draftIncidentTime).toBe('14:30')
      expect(contact.currentFlow).toBe('AWAITING_INCIDENT')
    })
  })

  // ── AWAITING_INCIDENT ─────────────────────────────────────────────────────

  describe('AWAITING_INCIDENT state', () => {
    it('rejects an incident shorter than 5 characters', async () => {
      const contact = makeContact('AWAITING_INCIDENT', {
        draftServiceName: 'Agua', draftIncidentDate: '15/03/2024', draftIncidentTime: '14:30',
      })
      await send(service, contact, 'no')
      expect(contact.currentFlow).toBe('AWAITING_INCIDENT')
    })

    it('accepts a valid incident and advances to AWAITING_CONFIRMATION', async () => {
      const contact = makeContact('AWAITING_INCIDENT', {
        draftServiceName: 'Agua', draftIncidentDate: '15/03/2024', draftIncidentTime: '14:30',
      })
      await send(service, contact, 'Fuga en la calle principal')
      expect(contact.draftIncidentText).toBe('Fuga en la calle principal')
      expect(contact.currentFlow).toBe('AWAITING_CONFIRMATION')
      expect(queuedTexts().some((t) => t.includes('Resumen del reporte'))).toBe(true)
    })
  })

  // ── AWAITING_CONFIRMATION ─────────────────────────────────────────────────

  describe('AWAITING_CONFIRMATION state', () => {
    function makeConfirmContact() {
      return makeContact('AWAITING_CONFIRMATION', {
        draftServiceName: 'Agua',
        draftIncidentDate: '15/03/2024',
        draftIncidentTime: '14:30',
        draftIncidentText: 'Fuga en calle principal',
      })
    }

    it('queues invalidConfirmation prompt on unrecognized response', async () => {
      const contact = makeConfirmContact()
      await send(service, contact, 'maybe')
      expect(queuedTexts().some((t) => t.toLowerCase().includes('no valida'))).toBe(true)
    })

    it('NO resets to AWAITING_SERVICE and clears draft', async () => {
      const contact = makeConfirmContact()
      await send(service, contact, 'NO')
      expect(contact.currentFlow).toBe('AWAITING_SERVICE')
      expect(contact.draftServiceName).toBeUndefined()
    })

    it('SI creates report via transaction', async () => {
      const contact = makeConfirmContact()
      await send(service, contact, 'SI')
      expect(mockTransaction).toHaveBeenCalledTimes(1)
    })

    it('SI resets draft after successful report creation', async () => {
      const contact = makeConfirmContact()
      await send(service, contact, 'SI')
      expect(contact.currentFlow).toBe('IDLE')
      expect(contact.draftServiceName).toBeNull()
    })

    it('SI sends confirmation message with folio', async () => {
      const contact = makeConfirmContact()
      await send(service, contact, 'SI')
      expect(queuedTexts().some((t) => t.includes('REP-20240101-1234'))).toBe(true)
    })

    it('SÍ (with accent) also confirms', async () => {
      const contact = makeConfirmContact()
      await send(service, contact, 'SÍ')
      expect(mockTransaction).toHaveBeenCalledTimes(1)
    })

    it('marks report as failed when group is not configured', async () => {
      mockResolveGroupJid.mockResolvedValueOnce(null as never)
      mockGetOperationsGroupJid.mockReturnValueOnce('' as never)
      const contact = makeConfirmContact()
      await send(service, contact, 'SI')
      expect(mockMarkFailed).toHaveBeenCalled()
    })

    it('still sends confirmation even when forward throws', async () => {
      mockMarkQueued.mockRejectedValueOnce(new Error('WhatsApp error'))
      const contact = makeConfirmContact()
      await send(service, contact, 'SI')
      expect(queuedTexts().some((t) => t.includes('REP-20240101-1234'))).toBe(true)
    })

    it('emits SSE events after report creation', async () => {
      const contact = makeConfirmContact()
      await send(service, contact, 'SI')
      expect(mockSseEmit).toHaveBeenCalledWith('client-1', 'report:created', expect.any(Object))
      expect(mockSseEmit).toHaveBeenCalledWith('client-1', 'dashboard:refresh')
    })
  })

  // ── Deduplication ─────────────────────────────────────────────────────────

  describe('duplicate message deduplication', () => {
    it('skips processing if externalMessageId was already seen', async () => {
      mockFindOne.mockResolvedValueOnce({ id: 'existing' } as never)
      mockUpsertContact.mockResolvedValueOnce(makeContact('IDLE') as never)
      await service.processIncomingText({ ...INPUT_BASE, text: 'hello', externalMessageId: 'msg-abc' })
      expect(mockQueueText).not.toHaveBeenCalled()
    })
  })
})
