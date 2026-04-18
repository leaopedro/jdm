import { randomUUID } from 'node:crypto';

import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import Fastify, { type FastifyInstance } from 'fastify';

import { type Env } from './env.js';
import { buildLoggerOptions } from './logger.js';
import { authPlugin } from './plugins/auth.js';
import { errorHandlerPlugin } from './plugins/error-handler.js';
import { requestIdPlugin } from './plugins/request-id.js';
import { sentryPlugin } from './plugins/sentry.js';
import { authRoutes } from './routes/auth/index.js';
import { healthRoutes } from './routes/health.js';
import { meRoutes } from './routes/me.js';
import { buildMailer, type Mailer } from './services/mailer/index.js';

declare module 'fastify' {
  interface FastifyInstance {
    mailer: Mailer;
    env: Env;
  }
}

export const buildApp = async (env: Env): Promise<FastifyInstance> => {
  const app = Fastify({
    logger: buildLoggerOptions(env),
    disableRequestLogging: false,
    genReqId: () => randomUUID(),
  });

  app.decorate('mailer', buildMailer(env));
  app.decorate('env', env);

  await app.register(requestIdPlugin);
  await app.register(sentryPlugin, { env });
  await app.register(sensible);
  await app.register(cors, {
    origin: env.CORS_ORIGINS.length > 0 ? env.CORS_ORIGINS : false,
    credentials: true,
  });
  await app.register(errorHandlerPlugin);
  await app.register(healthRoutes);
  await app.register(authPlugin);
  await app.register(meRoutes);
  await app.register(authRoutes, { prefix: '/auth' });

  if (env.NODE_ENV !== 'production') {
    app.get('/debug/boom', () => {
      throw new Error('intentional boom for Sentry verification');
    });
  }

  return app;
};
