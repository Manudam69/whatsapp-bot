import winston from 'winston'
import appRoot from 'app-root-path'

const logger = winston.createLogger({
  transports: [
    new winston.transports.File({
      level: 'warn',
      filename: 'app.log',
      dirname: `${appRoot}/logs/`,
      handleExceptions: true,
      format: winston.format.combine(winston.format.timestamp(), winston.format.simple()),
    }),
    new winston.transports.Console({
      level: 'debug',
      handleExceptions: true,
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf((info) => `[${new Date().toISOString()}] ${info.level}: ${info.message}`)
      ),
    }),
  ],
  exitOnError: false,
})

export default logger