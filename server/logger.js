const winston = require('winston');
const path = require('path');

// Create logs directory if it doesn't exist
const logDir = 'c:\\logs\\claude';

const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack }) => {
      return `${timestamp} [${level.toUpperCase()}]: ${stack || message}`;
    })
  ),
  transports: [
    // Console output
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, stack }) => {
          return `${timestamp} [${level}]: ${stack || message}`;
        })
      ),
    }),
    // File output with rotation
    new winston.transports.File({
      filename: path.join(logDir, 'test.log'),
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 100,
      tailable: true,
    }),
  ],
});

module.exports = logger;
