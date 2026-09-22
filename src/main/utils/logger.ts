import { join } from 'path'
import { homedir } from 'os'
import winston from 'winston'

const LOG_FILE = join(homedir(), '.flownote.log')

let _logger: winston.Logger | null = null

export function getLogger(name = 'flownote'): winston.Logger {
  if (_logger) return _logger

  _logger = winston.createLogger({
    level: 'debug',
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.printf(
        ({ timestamp, level, message }) => `${timestamp} [${level.toUpperCase()}] ${name}: ${message}`
      )
    ),
    transports: [
      new winston.transports.File({
        filename: LOG_FILE,
        level: 'info',
        format: winston.format.combine(
          winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
          winston.format.printf(
            ({ timestamp, level, message }) =>
              `${timestamp} [${level.toUpperCase()}] ${name}: ${message}`
          )
        )
      }),
      new winston.transports.Console({
        level: 'debug',
        format: winston.format.combine(
          winston.format.printf(({ level, message }) => `${level.toUpperCase()} | ${message}`)
        )
      })
    ]
  })

  return _logger
}
