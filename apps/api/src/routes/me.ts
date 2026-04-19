import { prisma } from '@jdm/db';
import { publicProfileSchema, updateProfileSchema } from '@jdm/shared/profile';
import type { FastifyPluginAsync } from 'fastify';

import { requireUser } from '../plugins/auth.js';
import type { Uploads } from '../services/uploads/index.js';

type DbUser = {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'organizer' | 'admin';
  emailVerifiedAt: Date | null;
  createdAt: Date;
  bio: string | null;
  city: string | null;
  stateCode: string | null;
  avatarObjectKey: string | null;
};

const serializeUser = (user: DbUser, uploads: Uploads) =>
  publicProfileSchema.parse({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    emailVerifiedAt: user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : null,
    createdAt: user.createdAt.toISOString(),
    bio: user.bio,
    city: user.city,
    stateCode: user.stateCode,
    avatarUrl: user.avatarObjectKey ? uploads.buildPublicUrl(user.avatarObjectKey) : null,
  });

// eslint-disable-next-line @typescript-eslint/require-await
export const meRoutes: FastifyPluginAsync = async (app) => {
  app.get('/me', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { sub } = requireUser(request);
    const user = await prisma.user.findUnique({ where: { id: sub } });
    if (!user) return reply.status(401).send({ error: 'Unauthorized' });
    return serializeUser(user, app.uploads);
  });

  app.patch('/me', { preHandler: [app.authenticate] }, async (request, _reply) => {
    const { sub } = requireUser(request);
    // Strip undefined values: Prisma's exactOptionalPropertyTypes rejects `string | undefined`
    // where its generated types expect `string | StringFieldUpdateOperationsInput`.
    const data = Object.fromEntries(
      Object.entries(updateProfileSchema.parse(request.body)).filter(([, v]) => v !== undefined),
    );
    const user = await prisma.user.update({ where: { id: sub }, data });
    return serializeUser(user, app.uploads);
  });
};
