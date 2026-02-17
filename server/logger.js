const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');

const LOG_DIR = 'c:\\logs';

const baseFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true })
);

const fileFormat = winston.format.combine(
  baseFormat,
  winston.format.printf(({ timestamp, level, message, module, stack, ...meta }) => {
    const prefix = module ? ` [${module}]` : '';
    const metaStr = Object.keys(meta).length > 0 ? ' ' + JSON.stringify(meta) : '';
    return `${timestamp} [${level.toUpperCase()}]${prefix} ${stack || message}${metaStr}`;
  })
);

const consoleFormat = winston.format.combine(
  baseFormat,
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, module, stack, ...meta }) => {
    const prefix = module ? ` [${module}]` : '';
    const metaStr = Object.keys(meta).length > 0 ? ' ' + JSON.stringify(meta) : '';
    return `${timestamp} ${level}${prefix} ${stack || message}${metaStr}`;
  })
);

const dailyRotateTransport = new DailyRotateFile({
  dirname: LOG_DIR,
  filename: 'office-simulator-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: 50,
  format: fileFormat,
});

const logger = winston.createLogger({
  level: 'debug',
  transports: [
    new winston.transports.Console({ format: consoleFormat }),
    dailyRotateTransport,
  ],
});

// Save reference to Winston's built-in child() before we overwrite it on the export
const _winstonChild = logger.child.bind(logger);

function child(moduleName) {
  return _winstonChild({ module: moduleName });
}

module.exports = logger;
module.exports.child = child;
