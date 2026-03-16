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

export const config = Object.freeze({
  ENV: process.env.ENV || 'development',
  APP_NAME: process.env.APP_NAME || 'Whatsapp Operations Bot',
  PROJECT_ROOT: projectRoot,
  FRONTEND_URL: frontendUrl,
  ALLOW_ORIGINS: Array.from(new Set(origins)),
  PORT: Number(process.env.PORT || 3000),
  OPERATIONS_GROUP_JID: process.env.OPERATIONS_GROUP_JID || '',
  DEFAULT_COUNTRY_CODE: process.env.DEFAULT_COUNTRY_CODE || '52',
  SCHEDULE_TIME_ZONE: process.env.SCHEDULE_TIME_ZONE || 'America/Mexico_City',
  MESSAGE_THROTTLE_MS: Number(process.env.MESSAGE_THROTTLE_MS || 1500),
  MAX_SEND_RETRIES: Number(process.env.MAX_SEND_RETRIES || 3),
  SESSION_AUTH_DIR: process.env.SESSION_AUTH_DIR || 'auth',
  MEDIA_UPLOAD_DIR: process.env.MEDIA_UPLOAD_DIR || 'uploads/media',
  AUTH: {
    JWT_SECRET: process.env.JWT_SECRET || 'change-this-secret-in-production',
    TOKEN_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '12h',
    DEFAULT_ADMIN_NAME: process.env.DEFAULT_ADMIN_NAME || 'Administrador Principal',
    DEFAULT_ADMIN_EMAIL: process.env.DEFAULT_ADMIN_EMAIL || 'admin@botpanel.app',
    DEFAULT_ADMIN_PASSWORD: process.env.DEFAULT_ADMIN_PASSWORD || 'BotAdmin2026',
  },
  DB: {
    HOST: process.env.DB_HOST || 'localhost',
    PORT: Number(process.env.DB_PORT || 5432),
    USER: process.env.DB_USER || 'postgres',
    PASSWORD: process.env.DB_PASSWORD || 'postgres',
    NAME: process.env.DB_NAME || 'whatsapp_bot',
    SYNCHRONIZE: process.env.DB_SYNCHRONIZE === 'true',
  },
})