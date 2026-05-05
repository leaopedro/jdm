import pino, { type LoggerOptions } from 'pino';

import type { Env } from './env.js';

export const buildLoggerOptions = (env: Env): LoggerOptions => {
  const opts: LoggerOptions = {
    level: env.LOG_LEVEL,
    base: { service: 'api', sha: env.GIT_SHA },
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-webhook-signature"]',
        '*.password',
        '*.token',
      ],
      censor: '[REDACTED]',
    },
  };
  if (env.NODE_ENV === 'development') {
    opts.transport = {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:standard' },
    };
  }
  return opts;
};

export const createLogger = (env: Env) => pino(buildLoggerOptions(env));
