import type { FastifyPluginAsync } from 'fastify';

import { adminCheckInRoutes } from './check-in.js';
import { adminEventRoutes } from './events.js';
import { adminTicketRoutes } from './tickets.js';
import { adminTierRoutes } from './tiers.js';
import { adminUserRoutes } from './users.js';

export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  // Check-in surface: staff can reach this; organizer/admin can too.
  await app.register(async (scope) => {
    scope.addHook('preHandler', scope.requireRole('organizer', 'admin', 'staff'));
    await scope.register(adminCheckInRoutes);
  });

  // Event + tier management + comp grants + user management: organizer/admin only.
  await app.register(async (scope) => {
    scope.addHook('preHandler', scope.requireRole('organizer', 'admin'));
    await scope.register(adminEventRoutes);
    await scope.register(adminTierRoutes);
    await scope.register(adminTicketRoutes);
    await scope.register(adminUserRoutes);
  });
};
