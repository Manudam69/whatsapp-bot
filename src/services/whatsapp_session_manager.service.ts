import fs from 'fs'
import { AppDataSource } from '@/database/datasource'
import logger from '@/utils/logger'
import { WhatsappSessionInstance, SessionState } from './whatsapp_session_instance'

export class WhatsappSessionManager {
  private sessions = new Map<string, WhatsappSessionInstance>()

  /**
   * Load all sessions from DB and start them.
   * Called once on application bootstrap.
   */
  async initAll(): Promise<void> {
    const rows = await AppDataSource.query<Array<{ id: string; client_id: string; auth_dir_key: string }>>(
      `SELECT "id", "client_id", "auth_dir_key" FROM "whatsapp_sessions" ORDER BY "created_at" ASC`,
    )

    logger.info(`WhatsappSessionManager: initializing ${rows.length} session(s)`)

    await Promise.allSettled(
      rows.map((row) => this.initSession(row.id, row.client_id, row.auth_dir_key)),
    )
  }

  /**
   * Initialize and start a single session.
   */
  async initSession(sessionId: string, clientId: string, authDirKey: string): Promise<SessionState> {
    if (this.sessions.has(sessionId)) {
      return this.sessions.get(sessionId)!.getSessionState()
    }

    const instance = new WhatsappSessionInstance({ sessionId, clientId, authDirKey })
    this.sessions.set(sessionId, instance)

    try {
      return await instance.start()
    } catch (err) {
      logger.error(`WhatsappSessionManager: failed to start session ${sessionId}: ${err instanceof Error ? err.message : err}`)
      // Remove the zombie instance so the session can be retried and resources are freed
      this.sessions.delete(sessionId)
      try { await instance.stop() } catch { /* best-effort cleanup */ }
      return instance.getSessionState()
    }
  }

  async stopSession(sessionId: string): Promise<SessionState | null> {
    const instance = this.sessions.get(sessionId)
    if (!instance) {
      return null
    }
    return instance.stop()
  }

  /**
   * Stop the session, delete its auth directory, and remove it from the in-memory map.
   */
  async removeSession(sessionId: string): Promise<void> {
    const instance = this.sessions.get(sessionId)
    if (instance) {
      await instance.stop()
      const authDir = instance.getAuthDir()
      fs.rmSync(authDir, { recursive: true, force: true })
      this.sessions.delete(sessionId)
      logger.info(`WhatsappSessionManager: removed session ${sessionId} and deleted auth dir ${authDir}`)
    }
  }

  async resetSession(sessionId: string): Promise<SessionState | null> {
    const instance = this.sessions.get(sessionId)
    if (!instance) {
      return null
    }
    return instance.reset()
  }

  getSession(sessionId: string): WhatsappSessionInstance | undefined {
    return this.sessions.get(sessionId)
  }

  getSessionsByClientId(clientId: string): WhatsappSessionInstance[] {
    return Array.from(this.sessions.values()).filter((s) => s.clientId === clientId)
  }

  getSessionState(sessionId: string): SessionState {
    return this.sessions.get(sessionId)?.getSessionState() ?? { status: 'idle' }
  }

  getAllSessionStates(): Array<{ sessionId: string; clientId: string; state: SessionState }> {
    return Array.from(this.sessions.entries()).map(([sessionId, instance]) => ({
      sessionId,
      clientId: instance.clientId,
      state: instance.getSessionState(),
    }))
  }
}

export const whatsappSessionManager = new WhatsappSessionManager()
