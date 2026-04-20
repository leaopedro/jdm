import type { FastifyPluginAsync } from 'fastify';

import { adminEventRoutes } from './events.js';
import { adminTierRoutes } from './tiers.js';

export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', app.requireRole('organizer', 'admin'));

  await app.register(adminEventRoutes);
  await app.register(adminTierRoutes);
};
