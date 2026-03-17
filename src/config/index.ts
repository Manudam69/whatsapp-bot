import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'

if (fs.existsSync(path.resolve(process.cwd(), '.env'))) {
  dotenv.config()
}

const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200'
const origins = [frontendUrl]
const projectRoot = path.resolve(__dirname, '..', '..')

if (process.env.ALLOW_ORIGINS) {
  origins.push(...process.env.ALLOW_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean))
}

class ConfigValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigValidationError'
  }
}

function readEnv(name: string) {
  return process.env[name]?.trim() || ''
}

function parseNumberEnv(name: string, fallback: number) {
  const rawValue = process.env[name]?.trim()
  if (!rawValue) {
    return fallback
  }

  const parsedValue = Number(rawValue)
  return Number.isNaN(parsedValue) ? Number.NaN : parsedValue
}

export const config = Object.freeze({
  ENV: process.env.ENV || 'development',
  APP_NAME: process.env.APP_NAME || 'Whatsapp Operations Bot',
  PROJECT_ROOT: projectRoot,
  FRONTEND_URL: frontendUrl,
  ALLOW_ORIGINS: Array.from(new Set(origins)),
  PORT: parseNumberEnv('PORT', 3000),
  OPERATIONS_GROUP_JID: process.env.OPERATIONS_GROUP_JID || '',
  DEFAULT_COUNTRY_CODE: process.env.DEFAULT_COUNTRY_CODE || '52',
  SCHEDULE_TIME_ZONE: process.env.SCHEDULE_TIME_ZONE || 'America/Mexico_City',
  MESSAGE_THROTTLE_MS: parseNumberEnv('MESSAGE_THROTTLE_MS', 1500),
  MAX_SEND_RETRIES: parseNumberEnv('MAX_SEND_RETRIES', 3),
  ANTIBAN_SKIP_WARMUP: process.env.ANTIBAN_SKIP_WARMUP === 'true',
  SESSION_AUTH_DIR: process.env.SESSION_AUTH_DIR || 'auth',
  MEDIA_UPLOAD_DIR: process.env.MEDIA_UPLOAD_DIR || 'uploads/media',
  AUTH: {
    JWT_SECRET: readEnv('JWT_SECRET'),
    TOKEN_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '12h',
    DEFAULT_ADMIN_NAME: readEnv('DEFAULT_ADMIN_NAME'),
    DEFAULT_ADMIN_EMAIL: readEnv('DEFAULT_ADMIN_EMAIL'),
    DEFAULT_ADMIN_PASSWORD: readEnv('DEFAULT_ADMIN_PASSWORD'),
  },
  DB: {
    HOST: process.env.DB_HOST || 'localhost',
    PORT: parseNumberEnv('DB_PORT', 5432),
    USER: readEnv('DB_USER'),
    PASSWORD: readEnv('DB_PASSWORD'),
    NAME: readEnv('DB_NAME'),
    SYNCHRONIZE: process.env.DB_SYNCHRONIZE === 'true',
  },
})

export function validateConfig() {
  const missingVariables = [
    'JWT_SECRET',
    'DEFAULT_ADMIN_NAME',
    'DEFAULT_ADMIN_EMAIL',
    'DEFAULT_ADMIN_PASSWORD',
    'DB_USER',
    'DB_PASSWORD',
    'DB_NAME',
  ].filter((name) => !readEnv(name))

  const invalidNumericVariables = [
    ['PORT', config.PORT],
    ['DB_PORT', config.DB.PORT],
    ['MESSAGE_THROTTLE_MS', config.MESSAGE_THROTTLE_MS],
    ['MAX_SEND_RETRIES', config.MAX_SEND_RETRIES],
  ].filter(([, value]) => Number.isNaN(value)).map(([name]) => name)

  if (missingVariables.length === 0 && invalidNumericVariables.length === 0) {
    return
  }

  const issues: string[] = []
  if (missingVariables.length > 0) {
    issues.push(`faltan: ${missingVariables.join(', ')}`)
  }

  if (invalidNumericVariables.length > 0) {
    issues.push(`números inválidos: ${invalidNumericVariables.join(', ')}`)
  }

  throw new ConfigValidationError(`Configuración inválida, ${issues.join(' | ')}`)
}