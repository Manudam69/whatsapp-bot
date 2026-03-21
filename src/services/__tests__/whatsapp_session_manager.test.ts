import { WhatsappSessionManager } from '../whatsapp_session_manager.service'

// ─── Mocks ───────────────────────────────────────────────────────────────────

// jest.mock is hoisted above variable declarations by Jest's transform, so mock
// factories must NOT reference outer const/let variables — they would be undefined.
// Instead, use jest.fn() inline and grab references via the imported mock object.

// Provide a manual factory so Jest never tries to load the actual module
// (which imports @whiskeysockets/baileys — an ESM package that CJS Jest can't parse)
jest.mock('../whatsapp_session_instance', () => ({
  WhatsappSessionInstance: jest.fn(),
}))
jest.mock('@/database/datasource', () => ({
  AppDataSource: { query: jest.fn().mockResolvedValue([]) },
}))
jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}))

import { WhatsappSessionInstance } from '../whatsapp_session_instance'
const MockedInstance = jest.mocked(WhatsappSessionInstance as jest.MockedClass<typeof WhatsappSessionInstance>)

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeMockInstance(sessionId: string, clientId: string, overrides: Record<string, jest.Mock> = {}) {
  return {
    sessionId,
    clientId,
    start: jest.fn().mockResolvedValue({ status: 'idle' }),
    stop: jest.fn().mockResolvedValue(undefined),
    getSessionState: jest.fn().mockReturnValue({ status: 'idle' }),
    isConnected: jest.fn().mockReturnValue(false),
    getAuthDir: jest.fn().mockReturnValue('/auth/test'),
    reset: jest.fn(),
    ...overrides,
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('WhatsappSessionManager', () => {
  let manager: WhatsappSessionManager
  let mockInstance: ReturnType<typeof makeMockInstance>

  beforeEach(() => {
    manager = new WhatsappSessionManager()
    mockInstance = makeMockInstance('s1', 'c1')
    MockedInstance.mockImplementation(({ sessionId, clientId }: { sessionId: string; clientId: string }) =>
      makeMockInstance(sessionId, clientId) as unknown as InstanceType<typeof WhatsappSessionInstance>
    )
  })

  // ── initSession ────────────────────────────────────────────────────────────

  describe('initSession', () => {
    it('returns existing state without re-creating when session already in map', async () => {
      await manager.initSession('s1', 'c1', 'key')
      await manager.initSession('s1', 'c1', 'key')
      expect(MockedInstance).toHaveBeenCalledTimes(1)
    })

    it('starts the instance and returns its state on success', async () => {
      MockedInstance.mockImplementationOnce(({ sessionId, clientId }) => {
        const inst = makeMockInstance(sessionId, clientId)
        inst.start.mockResolvedValue({ status: 'qr' })
        return inst as unknown as InstanceType<typeof WhatsappSessionInstance>
      })
      const state = await manager.initSession('s2', 'c1', 'key')
      expect(state).toEqual({ status: 'qr' })
    })

    it('removes zombie instance from map when start() throws', async () => {
      MockedInstance.mockImplementationOnce(({ sessionId, clientId }) => {
        const inst = makeMockInstance(sessionId, clientId)
        inst.start.mockRejectedValue(new Error('connection refused'))
        return inst as unknown as InstanceType<typeof WhatsappSessionInstance>
      })
      await manager.initSession('s3', 'c1', 'key')
      // Zombie removed — session is NOT in the map
      expect(manager.getSession('s3')).toBeUndefined()
    })

    it('calls stop() on the instance to free resources when start() throws', async () => {
      let capturedStop: jest.Mock | undefined
      MockedInstance.mockImplementationOnce(({ sessionId, clientId }) => {
        const inst = makeMockInstance(sessionId, clientId)
        inst.start.mockRejectedValue(new Error('fatal'))
        capturedStop = inst.stop
        return inst as unknown as InstanceType<typeof WhatsappSessionInstance>
      })
      await manager.initSession('s4', 'c1', 'key')
      expect(capturedStop).toHaveBeenCalledTimes(1)
    })

    it('returns the instance state even after a failed start', async () => {
      MockedInstance.mockImplementationOnce(({ sessionId, clientId }) => {
        const inst = makeMockInstance(sessionId, clientId)
        inst.start.mockRejectedValue(new Error('fatal'))
        inst.getSessionState.mockReturnValue({ status: 'idle' })
        return inst as unknown as InstanceType<typeof WhatsappSessionInstance>
      })
      const state = await manager.initSession('s5', 'c1', 'key')
      expect(state).toEqual({ status: 'idle' })
    })

    it('allows retry after a failed start (not stuck in map)', async () => {
      MockedInstance.mockImplementationOnce(({ sessionId, clientId }) => {
        const inst = makeMockInstance(sessionId, clientId)
        inst.start.mockRejectedValue(new Error('first attempt fails'))
        return inst as unknown as InstanceType<typeof WhatsappSessionInstance>
      })
      await manager.initSession('s6', 'c1', 'key') // fails, removed

      await manager.initSession('s6', 'c1', 'key') // retry
      expect(MockedInstance).toHaveBeenCalledTimes(2)
    })
  })

  // ── getSession / getSessionsByClientId ────────────────────────────────────

  describe('getSession / getSessionsByClientId', () => {
    it('returns undefined for an unknown session', () => {
      expect(manager.getSession('nonexistent')).toBeUndefined()
    })

    it('returns the instance after a successful init', async () => {
      await manager.initSession('s7', 'c2', 'key')
      expect(manager.getSession('s7')).toBeDefined()
    })

    it('filters sessions by clientId', async () => {
      await manager.initSession('s8', 'client-A', 'key1')
      await manager.initSession('s9', 'client-B', 'key2')
      const sessions = manager.getSessionsByClientId('client-A')
      expect(sessions).toHaveLength(1)
      expect(sessions[0]?.sessionId).toBe('s8')
    })
  })

  // ── getSessionState ────────────────────────────────────────────────────────

  describe('getSessionState', () => {
    it('returns idle for unknown session', () => {
      expect(manager.getSessionState('unknown')).toEqual({ status: 'idle' })
    })
  })

  // ── stopSession ────────────────────────────────────────────────────────────

  describe('stopSession', () => {
    it('returns null for a non-existent session', async () => {
      expect(await manager.stopSession('ghost')).toBeNull()
    })
  })
})
