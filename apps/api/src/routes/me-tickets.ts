import { prisma } from '@jdm/db';
import { myTicketsResponseSchema } from '@jdm/shared/tickets';
import type { FastifyPluginAsync } from 'fastify';

import { requireUser } from '../plugins/auth.js';
import { signTicketCode } from '../services/tickets/codes.js';

// eslint-disable-next-line @typescript-eslint/require-await
export const meTicketsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/me/tickets', { preHandler: [app.authenticate] }, async (request) => {
    const { sub } = requireUser(request);
    const tickets = await prisma.ticket.findMany({
      where: { userId: sub },
      include: { event: true, tier: true },
    });

    const now = Date.now();
    // "upcoming-or-live" = event has not yet finished. Keeps tickets for events
    // currently in progress sorted with upcoming rather than buried under past.
    const sorted = tickets.slice().sort((a, b) => {
      const aFuture = a.event.endsAt.getTime() >= now;
      const bFuture = b.event.endsAt.getTime() >= now;
      if (aFuture !== bFuture) return aFuture ? -1 : 1;
      return aFuture
        ? a.event.startsAt.getTime() - b.event.startsAt.getTime()
        : b.event.startsAt.getTime() - a.event.startsAt.getTime();
    });

    return myTicketsResponseSchema.parse({
      items: sorted.map((t) => ({
        id: t.id,
        code: signTicketCode(t.id, app.env),
        status: t.status,
        source: t.source,
        tierName: t.tier.name,
        usedAt: t.usedAt?.toISOString() ?? null,
        createdAt: t.createdAt.toISOString(),
        event: {
          id: t.event.id,
          slug: t.event.slug,
          title: t.event.title,
          coverUrl: t.event.coverObjectKey
            ? app.uploads.buildPublicUrl(t.event.coverObjectKey)
            : null,
          startsAt: t.event.startsAt.toISOString(),
          endsAt: t.event.endsAt.toISOString(),
          venueName: t.event.venueName,
          city: t.event.city,
          stateCode: t.event.stateCode,
          type: t.event.type,
        },
      })),
    });
  });
};
