import rateLimit from '@fastify/rate-limit';
import type { FastifyPluginAsync } from 'fastify';

import { adminCheckInRoutes } from './check-in.js';
import { adminCollectionRoutes } from './collections.js';
import { adminEventRoutes } from './events.js';
import { adminExtraRoutes } from './extras.js';
import { adminFinanceRoutes } from './finance.js';
import { adminStoreInventoryRoutes } from './store/inventory.js';
import { adminStorePhotoRoutes } from './store/photos.js';
import { adminStoreProductRoutes } from './store/products.js';
import { adminStoreVariantRoutes } from './store/variants.js';
import { adminStoreProductTypeRoutes } from './store-product-types.js';
import { adminStoreSettingsRoutes } from './store-settings.js';
import { adminTicketRoutes } from './tickets.js';
import { adminTierRoutes } from './tiers.js';
import { adminUserMutationRoutes, adminUserRoutes } from './users.js';

export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);

  // Check-in surface: staff can reach this; organizer/admin can too.
  await app.register(async (scope) => {
    scope.addHook('preHandler', scope.requireRole('organizer', 'admin', 'staff'));
    await scope.register(adminCheckInRoutes);
  });

  // Event + tier management + comp grants: organizer/admin only. Staff are rejected here.
  await app.register(async (scope) => {
    scope.addHook('preHandler', scope.requireRole('organizer', 'admin'));
    await scope.register(adminEventRoutes);
    await scope.register(adminTierRoutes);
    await scope.register(adminExtraRoutes);
    await scope.register(adminTicketRoutes);
    await scope.register(adminUserRoutes);
    await scope.register(adminFinanceRoutes);
    await scope.register(adminStoreProductTypeRoutes);
    await scope.register(adminStoreSettingsRoutes);
    await scope.register(adminStoreProductRoutes);
    await scope.register(adminStoreVariantRoutes);
    await scope.register(adminStorePhotoRoutes);
    await scope.register(adminStoreInventoryRoutes);
    await scope.register(adminCollectionRoutes);
  });

  // User create/disable/enable: admin-only with tighter rate limit.
  await app.register(async (scope) => {
    scope.addHook('preHandler', scope.requireRole('admin'));
    await scope.register(rateLimit, {
      max: 30,
      timeWindow: '1 minute',
      keyGenerator: (req) => {
        const auth = (req as unknown as { user?: { sub?: string } }).user;
        return auth?.sub ? `admin-user-mut:${auth.sub}` : `admin-user-mut-ip:${req.ip}`;
      },
    });
    await scope.register(adminUserMutationRoutes);
  });
};
