import fs from 'fs'
import path from 'path'
import { DataSource } from 'typeorm'
import { config } from '@/config'

function getEntities() {
  const entitiesDir = path.resolve(__dirname, '../entities')
  return fs
    .readdirSync(entitiesDir, { withFileTypes: true })
    .map((entry) => (entry.isDirectory() || !entry.name.endsWith('.entity.js') && !entry.name.endsWith('.entity.ts') ? '' : path.join(entitiesDir, entry.name)))
    .filter(Boolean)
}

function getMigrations() {
  const migrationsDir = path.resolve(__dirname, './migrations')
  return fs.readdirSync(migrationsDir, { withFileTypes: true }).map((entry) => (entry.isDirectory() ? '' : path.join(migrationsDir, entry.name))).filter(Boolean)
}

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: config.DB.HOST,
  port: config.DB.PORT,
  username: config.DB.USER,
  password: config.DB.PASSWORD,
  database: config.DB.NAME,
  synchronize: config.DB.SYNCHRONIZE,
  logging: false,
  entities: getEntities(),
  migrations: getMigrations(),
})