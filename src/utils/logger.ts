import winston from 'winston'
import appRoot from 'app-root-path'
import { getRequestId } from './request_context'

function withRequestId(message: string): string {
  const requestId = getRequestId()
  return requestId ? `[${requestId}] ${message}` : message
}

const requestIdFormat = winston.format((info) => {
  info.message = withRequestId(String(info.message))
  return info
})

const logger = winston.createLogger({
  transports: [
    new winston.transports.File({
      level: 'warn',
      filename: 'app.log',
      dirname: `${appRoot}/logs/`,
      handleExceptions: true,
      format: winston.format.combine(requestIdFormat(), winston.format.timestamp(), winston.format.simple()),
    }),
    new winston.transports.Console({
      level: 'debug',
      handleExceptions: true,
      format: winston.format.combine(
        requestIdFormat(),
        winston.format.colorize(),
        winston.format.printf((info) => `[${new Date().toISOString()}] ${info.level}: ${info.message}`)
      ),
    }),
  ],
  exitOnError: false,
})

export default logger