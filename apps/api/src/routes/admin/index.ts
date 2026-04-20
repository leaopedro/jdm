import type { FastifyPluginAsync } from 'fastify';

import { adminEventRoutes } from './events.js';

export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireRole('organizer', 'admin'));

  await app.register(adminEventRoutes);
};
