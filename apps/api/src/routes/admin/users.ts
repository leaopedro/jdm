import { prisma } from '@jdm/db';
import {
  adminUserDetailSchema,
  adminUsersListQuerySchema,
  adminUsersListResponseSchema,
} from '@jdm/shared/admin';
import type { Prisma } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';

const encodeCursor = (u: { createdAt: Date; id: string }): string =>
  Buffer.from(JSON.stringify({ c: u.createdAt.toISOString(), i: u.id })).toString('base64url');

const decodeCursor = (raw: string): { createdAt: Date; id: string } => {
  const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString()) as { c: string; i: string };
  return { createdAt: new Date(parsed.c), id: parsed.i };
};

// eslint-disable-next-line @typescript-eslint/require-await
export const adminUserRoutes: FastifyPluginAsync = async (app) => {
  // GET /users — paginated user search
  app.get('/users', async (request, reply) => {
    const query = adminUsersListQuerySchema.parse(request.query);

    const where: Prisma.UserWhereInput = {};

    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { email: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    if (query.cursor) {
      try {
        const { createdAt, id } = decodeCursor(query.cursor);
        where.AND = [
          ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
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
      take: query.limit + 1,
      select: { id: true, name: true, email: true, avatarObjectKey: true, createdAt: true },
    });

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page[page.length - 1];

    return adminUsersListResponseSchema.parse({
      items: page.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        avatarUrl: u.avatarObjectKey ? app.uploads.buildPublicUrl(u.avatarObjectKey) : null,
      })),
      nextCursor: hasMore && last ? encodeCursor(last) : null,
    });
  });

  // GET /users/:id — user detail with stats + recent tickets/orders
  app.get('/users/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatarObjectKey: true,
        createdAt: true,
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
        include: {
          event: { select: { title: true } },
          tier: { select: { name: true } },
        },
      }),
      prisma.order.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          event: { select: { title: true } },
          tier: { select: { name: true } },
        },
      }),
    ]);

    return adminUserDetailSchema.parse({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatarUrl: user.avatarObjectKey ? app.uploads.buildPublicUrl(user.avatarObjectKey) : null,
      createdAt: user.createdAt.toISOString(),
      stats: { totalTickets, totalOrders },
      recentTickets: recentTickets.map((t) => ({
        id: t.id,
        eventTitle: t.event.title,
        tierName: t.tier.name,
        status: t.status,
        source: t.source,
        createdAt: t.createdAt.toISOString(),
      })),
      recentOrders: recentOrders.map((o) => ({
        id: o.id,
        eventTitle: o.event.title,
        tierName: o.tier.name,
        amountCents: o.amountCents,
        status: o.status,
        createdAt: o.createdAt.toISOString(),
      })),
    });
  });
};
