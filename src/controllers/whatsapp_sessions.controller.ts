import { NextFunction, Request, Response } from 'express'
import QRCode from 'qrcode'
import { AppDataSource } from '@/database/datasource'
import { panelAdminService } from '@/services/panel_admin.service'
import { whatsappSessionManager } from '@/services/whatsapp_session_manager.service'
import { NotFound, Forbidden } from '@/middlewares/error_handler'

type WhatsappSessionRow = {
  id: string
  client_id: string
  auth_dir_key: string
  phone_number: string | null
  status: string
  connected_at: string | null
  created_at: string
}

async function findSessionForClient(clientId: string, sessionId: string) {
  const rows = await AppDataSource.query<WhatsappSessionRow[]>(
    `SELECT * FROM "whatsapp_sessions" WHERE "id" = $1 AND "client_id" = $2`,
    [sessionId, clientId],
  )
  if (!rows[0]) throw NotFound('Sesión no encontrada.')
  return rows[0]
}

function mapSessionRow(row: WhatsappSessionRow, liveState?: ReturnType<typeof whatsappSessionManager.getSessionState>) {
  const state = liveState ?? { status: row.status as 'idle' | 'connecting' | 'qr' | 'connected' | 'disconnected' }
  return {
    id: row.id,
    authDirKey: row.auth_dir_key,
    phoneNumber: state.phoneNumber ?? row.phone_number ?? '',
    status: panelAdminService.mapSession(state).status,
    connectedAt: panelAdminService.mapSession(state).connectedAt,
  }
}

export async function createSession(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = req.authUser!.clientId

    // Derive authDirKey from client name, with a numeric suffix if the key is already taken
    const clientRows = await AppDataSource.query<Array<{ name: string }>>(
      `SELECT "name" FROM "clients" WHERE "id" = $1`,
      [clientId],
    )
    const clientName = clientRows[0]?.name ?? clientId
    const baseKey = clientName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

    const existingKeys = await AppDataSource.query<Array<{ auth_dir_key: string }>>(
      `SELECT "auth_dir_key" FROM "whatsapp_sessions" WHERE "client_id" = $1`,
      [clientId],
    )
    const takenKeys = new Set(existingKeys.map((r) => r.auth_dir_key))

    let authDirKey = baseKey
    let suffix = 2
    while (takenKeys.has(authDirKey)) {
      authDirKey = `${baseKey}-${suffix++}`
    }

    const rows = await AppDataSource.query<WhatsappSessionRow[]>(
      `INSERT INTO "whatsapp_sessions" ("client_id", "auth_dir_key", "status")
       VALUES ($1, $2, 'idle')
       RETURNING *`,
      [clientId, authDirKey],
    )
    const row = rows[0]
    const state = await whatsappSessionManager.initSession(row.id, row.client_id, row.auth_dir_key)
    const mapped = mapSessionRow(row, state)

    if (state.qr) {
      res.status(201).json({ ...mapped, qrCode: await QRCode.toDataURL(state.qr) })
    } else {
      res.status(201).json(mapped)
    }
  } catch (error) {
    next(error)
  }
}

export async function listSessions(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = req.authUser!.clientId
    const rows = await AppDataSource.query<WhatsappSessionRow[]>(
      `SELECT * FROM "whatsapp_sessions" WHERE "client_id" = $1 ORDER BY "created_at" ASC`,
      [clientId],
    )

    const result = await Promise.all(
      rows.map(async (row) => {
        const state = whatsappSessionManager.getSessionState(row.id)
        const mapped = mapSessionRow(row, state)
        if (state.qr) {
          return { ...mapped, qrCode: await QRCode.toDataURL(state.qr) }
        }
        return mapped
      }),
    )
    res.json(result)
  } catch (error) {
    next(error)
  }
}

export async function getSessionById(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = req.authUser!.clientId
    const sessionId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    const row = await findSessionForClient(clientId, sessionId)
    const state = whatsappSessionManager.getSessionState(sessionId)
    const mapped = mapSessionRow(row, state)

    if (state.qr) {
      res.json({ ...mapped, qrCode: await QRCode.toDataURL(state.qr) })
    } else {
      res.json(mapped)
    }
  } catch (error) {
    next(error)
  }
}

export async function connectSession(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = req.authUser!.clientId
    const sessionId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    const row = await findSessionForClient(clientId, sessionId)

    const state = await whatsappSessionManager.initSession(row.id, row.client_id, row.auth_dir_key)
    const mapped = mapSessionRow(row, state)

    if (state.qr) {
      res.json({ ...mapped, qrCode: await QRCode.toDataURL(state.qr) })
    } else {
      res.json(mapped)
    }
  } catch (error) {
    next(error)
  }
}

export async function disconnectSession(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = req.authUser!.clientId
    const sessionId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    const row = await findSessionForClient(clientId, sessionId)

    const state = await whatsappSessionManager.stopSession(sessionId) ?? { status: 'idle' as const }
    res.json(mapSessionRow(row, state))
  } catch (error) {
    next(error)
  }
}

export async function resetSession(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = req.authUser!.clientId
    const sessionId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    const row = await findSessionForClient(clientId, sessionId)

    const state = await whatsappSessionManager.resetSession(sessionId) ?? { status: 'idle' as const }
    const mapped = mapSessionRow(row, state)

    if (state.qr) {
      res.json({ ...mapped, qrCode: await QRCode.toDataURL(state.qr) })
    } else {
      res.json(mapped)
    }
  } catch (error) {
    next(error)
  }
}

export async function deleteSession(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = req.authUser!.clientId
    const sessionId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    await findSessionForClient(clientId, sessionId)

    await whatsappSessionManager.removeSession(sessionId)
    await AppDataSource.query(`DELETE FROM "whatsapp_sessions" WHERE "id" = $1`, [sessionId])

    res.status(204).end()
  } catch (error) {
    next(error)
  }
}

export async function getSessionQr(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = req.authUser!.clientId
    const sessionId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    await findSessionForClient(clientId, sessionId)

    const state = whatsappSessionManager.getSessionState(sessionId)
    if (!state.qr) {
      throw Forbidden('No hay código QR disponible para esta sesión.')
    }

    res.json({ qrCode: await QRCode.toDataURL(state.qr) })
  } catch (error) {
    next(error)
  }
}
