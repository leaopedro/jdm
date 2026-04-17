import { randomUUID } from 'node:crypto';

import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import Fastify, { type FastifyInstance } from 'fastify';

import { type Env } from './env.js';
import { buildLoggerOptions } from './logger.js';
import { errorHandlerPlugin } from './plugins/error-handler.js';
import { requestIdPlugin } from './plugins/request-id.js';
import { sentryPlugin } from './plugins/sentry.js';
import { healthRoutes } from './routes/health.js';

export const buildApp = async (env: Env): Promise<FastifyInstance> => {
  const app = Fastify({
    logger: buildLoggerOptions(env),
    disableRequestLogging: false,
    genReqId: () => randomUUID(),
  });

  await app.register(requestIdPlugin);
  await app.register(sentryPlugin, { env });
  await app.register(sensible);
  await app.register(cors, {
    origin: env.CORS_ORIGINS.length > 0 ? env.CORS_ORIGINS : false,
    credentials: true,
  });
  await app.register(errorHandlerPlugin);
  await app.register(healthRoutes);

  return app;
};
