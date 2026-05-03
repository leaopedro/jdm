import { prisma } from '@jdm/db';
import {
  adminUserDetailSchema,
  adminUserSearchQuerySchema,
  adminUserSearchResponseSchema,
} from '@jdm/shared/admin';
import type { Prisma, User as DbUser } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';

import type { Uploads } from '../../services/uploads/index.js';

const encodeCursor = (u: Pick<DbUser, 'createdAt' | 'id'>): string =>
  Buffer.from(JSON.stringify({ c: u.createdAt.toISOString(), i: u.id })).toString('base64url');

const decodeCursor = (raw: string): { createdAt: Date; id: string } => {
  const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString()) as {
    c: string;
    i: string;
  };
  return { createdAt: new Date(parsed.c), id: parsed.i };
};

const avatarUrl = (u: Pick<DbUser, 'avatarObjectKey'>, uploads: Uploads): string | null =>
  u.avatarObjectKey ? uploads.buildPublicUrl(u.avatarObjectKey) : null;

// eslint-disable-next-line @typescript-eslint/require-await
export const adminUserRoutes: FastifyPluginAsync = async (app) => {
  app.get('/users', async (request, reply) => {
    const { q, cursor, limit } = adminUserSearchQuerySchema.parse(request.query);

    const where: Prisma.UserWhereInput = {};
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (cursor) {
      try {
        const { createdAt, id } = decodeCursor(cursor);
        where.AND = [
          {
            OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }],
          },
        ];
      } catch {
        return reply.status(400).send({ error: 'BadRequest', message: 'invalid cursor' });
      }
    }

    const rows = await prisma.user.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true,
        name: true,
        email: true,
        avatarObjectKey: true,
        createdAt: true,
      },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];

    return adminUserSearchResponseSchema.parse({
      items: page.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        avatarUrl: avatarUrl(u, app.uploads),
      })),
      nextCursor: hasMore && last ? encodeCursor(last) : null,
    });
  });

  app.get('/users/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        emailVerifiedAt: true,
        createdAt: true,
        bio: true,
        city: true,
        stateCode: true,
        avatarObjectKey: true,
      },
    });
    if (!user) return reply.status(404).send({ error: 'NotFound' });

    const [totalTickets, totalOrders, recentTickets, recentOrders] = await Promise.all([
      prisma.ticket.count({ where: { userId: id } }),
      prisma.order.count({ where: { userId: id } }),
      prisma.ticket.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          status: true,
          source: true,
          createdAt: true,
          event: { select: { title: true } },
        },
      }),
      prisma.order.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          status: true,
          amountCents: true,
          currency: true,
          createdAt: true,
          event: { select: { title: true } },
        },
      }),
    ]);

    return adminUserDetailSchema.parse({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
      bio: user.bio ?? null,
      city: user.city ?? null,
      stateCode: user.stateCode ?? null,
      avatarUrl: avatarUrl(user, app.uploads),
      stats: { totalTickets, totalOrders },
      recentTickets: recentTickets.map((t) => ({
        id: t.id,
        status: t.status,
        source: t.source,
        eventTitle: t.event.title,
        createdAt: t.createdAt.toISOString(),
      })),
      recentOrders: recentOrders.map((o) => ({
        id: o.id,
        status: o.status,
        amountCents: o.amountCents,
        currency: o.currency,
        eventTitle: o.event.title,
        createdAt: o.createdAt.toISOString(),
      })),
    });
  });
};
