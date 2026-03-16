import 'reflect-metadata'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import path from 'path'
import { config } from '@/config'
import logger from '@/utils/logger'
import { AppDataSource } from '@/database/datasource'
import handleErrorMiddleware from '@/middlewares/error_handler'
import { initFileBasedRoutes } from '@/utils/file_routes'
import { authService } from '@/services/auth.service'
import { schedulerService } from '@/services/scheduler.service'
import { whatsappService } from '@/services/whatsapp.service'

const app = express()
const router = express.Router()

async function bootstrap() {
  await AppDataSource.initialize()
  logger.info('Database connection established')

  if (!config.DB.SYNCHRONIZE && AppDataSource.migrations.length > 0) {
    await AppDataSource.runMigrations()
    logger.info('Database migrations executed')
  }

  await authService.ensureDefaultAdminUser()
  logger.info(`Default admin ensured for ${config.AUTH.DEFAULT_ADMIN_EMAIL}`)

  await initFileBasedRoutes(router)

  app.use(morgan('[:date[iso]] (:status) ":method :url HTTP/:http-version" :response-time ms - [:res[content-length]]'))
  app.use(cors({ origin: config.ALLOW_ORIGINS }))
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }))
  app.use(express.json())
  app.use(express.urlencoded({ extended: false }))
  app.use('/uploads', express.static(path.resolve(config.PROJECT_ROOT, 'uploads')))

  app.use(router)
  app.use(handleErrorMiddleware)

  const server = app.listen(config.PORT, async () => {
    logger.info(`Server listening on http://localhost:${config.PORT}`)
    await whatsappService.start()
    schedulerService.start()
  })

  server.on('error', (error) => {
    logger.error(`HTTP server error: ${error}`)
  })
}

bootstrap().catch((error) => {
  logger.error(`Bootstrap error: ${error instanceof Error ? error.stack || error.message : String(error)}`)
  process.exit(1)
})