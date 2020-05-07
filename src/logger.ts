import { createLogger, format, transports } from 'winston';
import { LoggingLevel } from './logger.types';

const logger = createLogger({
  format: format.combine(format.colorize(), format.simple()),
  transports: [
    new transports.Console({
      level: LoggingLevel.info,
    }),
  ],
});

export function setLoggingLevel(level: LoggingLevel = LoggingLevel.info): void {
  logger.transports[0].level = level;
}

export default logger;
