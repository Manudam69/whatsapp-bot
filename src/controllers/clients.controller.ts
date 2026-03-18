import { NextFunction, Request, Response } from 'express'
import { AppDataSource } from '@/database/datasource'
import { BadRequest, NotFound } from '@/middlewares/error_handler'

type ClientRow = {
  id: string
  name: string
  display_name: string
  client_class: string | null
  created_at: string
  updated_at: string
}

type ClientInput = {
  name?: string
  displayName?: string
  clientClass?: string
}

function mapClient(row: ClientRow) {
  return {
    id: row.id,
    name: row.name,
    displayName: row.display_name,
    clientClass: row.client_class ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listClients(_req: Request, res: Response, next: NextFunction) {
  try {
    const rows = await AppDataSource.query<ClientRow[]>(
      `SELECT "id", "name", "display_name", "client_class", "created_at", "updated_at" FROM "clients" ORDER BY "created_at" ASC`,
    )
    res.json(rows.map(mapClient))
  } catch (error) {
    next(error)
  }
}

export async function createClient(req: Request, res: Response, next: NextFunction) {
  try {
    const input: ClientInput = req.body ?? {}
    const name = input.name?.trim()
    const displayName = input.displayName?.trim()

    if (!name) throw BadRequest('El nombre técnico es obligatorio.')
    if (!displayName) throw BadRequest('El nombre visible es obligatorio.')

    const existing = await AppDataSource.query<ClientRow[]>(
      `SELECT "id" FROM "clients" WHERE "name" = $1`,
      [name],
    )
    if (existing.length > 0) throw BadRequest('Ya existe un cliente con ese nombre técnico.')

    const rows = await AppDataSource.query<ClientRow[]>(
      `INSERT INTO "clients" ("name", "display_name", "client_class", "created_at", "updated_at")
       VALUES ($1, $2, $3, NOW(), NOW()) RETURNING *`,
      [name, displayName, input.clientClass?.trim() ?? null],
    )

    res.status(201).json(mapClient(rows[0]!))
  } catch (error) {
    next(error)
  }
}

export async function updateClient(req: Request, res: Response, next: NextFunction) {
  try {
    const clientId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    const input: ClientInput = req.body ?? {}

    const existing = await AppDataSource.query<ClientRow[]>(
      `SELECT * FROM "clients" WHERE "id" = $1`,
      [clientId],
    )
    if (!existing[0]) throw NotFound('Cliente no encontrado.')

    const name = input.name?.trim() ?? existing[0].name
    const displayName = input.displayName?.trim() ?? existing[0].display_name
    const clientClass = input.clientClass !== undefined ? input.clientClass.trim() : existing[0].client_class

    if (!name) throw BadRequest('El nombre técnico es obligatorio.')
    if (!displayName) throw BadRequest('El nombre visible es obligatorio.')

    const rows = await AppDataSource.query<ClientRow[]>(
      `UPDATE "clients" SET "name" = $1, "display_name" = $2, "client_class" = $3, "updated_at" = NOW()
       WHERE "id" = $4 RETURNING *`,
      [name, displayName, clientClass, clientId],
    )

    res.json(mapClient(rows[0]!))
  } catch (error) {
    next(error)
  }
}
