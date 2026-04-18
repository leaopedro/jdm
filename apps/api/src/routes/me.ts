import { prisma } from '@jdm/db';
import { publicUserSchema } from '@jdm/shared/auth';
import type { FastifyPluginAsync } from 'fastify';

import { requireUser } from '../plugins/auth.js';

// eslint-disable-next-line @typescript-eslint/require-await
export const meRoutes: FastifyPluginAsync = async (app) => {
  app.get('/me', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { sub } = requireUser(request);
    const user = await prisma.user.findUnique({ where: { id: sub } });
    if (!user) return reply.status(401).send({ error: 'Unauthorized' });
    return publicUserSchema.parse({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      emailVerifiedAt: user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : null,
      createdAt: user.createdAt.toISOString(),
    });
  });
};
