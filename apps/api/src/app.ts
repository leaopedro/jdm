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
import { adminRoutes } from './routes/admin/index.js';
import { authRoutes } from './routes/auth/index.js';
import { carRoutes } from './routes/cars.js';
import { devUploadRoutes } from './routes/dev-uploads.js';
import { eventRoutes } from './routes/events.js';
import { healthRoutes } from './routes/health.js';
import { meRoutes } from './routes/me.js';
import { orderRoutes } from './routes/orders.js';
import { stripeWebhookRoutes } from './routes/stripe-webhook.js';
import { uploadRoutes } from './routes/uploads.js';
import { buildMailer, type Mailer } from './services/mailer/index.js';
import { buildStripe, type StripeClient } from './services/stripe/index.js';
import { DevUploads } from './services/uploads/dev.js';
import { buildUploads, type Uploads } from './services/uploads/index.js';

declare module 'fastify' {
  interface FastifyInstance {
    mailer: Mailer;
    env: Env;
    uploads: Uploads;
    stripe: StripeClient;
  }
}

export type BuildAppOverrides = {
  stripe?: StripeClient;
};

export const buildApp = async (
  env: Env,
  overrides: BuildAppOverrides = {},
): Promise<FastifyInstance> => {
  const app = Fastify({
    logger: buildLoggerOptions(env),
    disableRequestLogging: false,
    genReqId: () => randomUUID(),
  });

  app.decorate('mailer', buildMailer(env));
  app.decorate('env', env);
  app.decorate('uploads', buildUploads(env));
  app.decorate('stripe', overrides.stripe ?? buildStripe(env));

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
  await app.register(uploadRoutes);
  await app.register(carRoutes);
  await app.register(eventRoutes);
  await app.register(orderRoutes);
  await app.register(stripeWebhookRoutes);
  await app.register(adminRoutes, { prefix: '/admin' });
  await app.register(authRoutes, { prefix: '/auth' });

  if (env.NODE_ENV !== 'production') {
    // Register dev file server only when DevUploads is active.
    // Staging with R2 keys present uses R2Uploads and skips this.
    if (app.uploads instanceof DevUploads) {
      await app.register(devUploadRoutes);
    }
    app.get('/debug/boom', () => {
      throw new Error('intentional boom for Sentry verification');
    });
  }

  return app;
};
