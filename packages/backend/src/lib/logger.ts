import winston from 'winston';

const level = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'warn' : 'info');

export const logger = winston.createLogger({
  level,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'aarogyamai-backend' },
  transports: [
    new winston.transports.Console({
      format:
        process.env.NODE_ENV === 'production'
          ? winston.format.json()
          : winston.format.combine(winston.format.timestamp(), winston.format.simple()),
    }),
  ],
});
