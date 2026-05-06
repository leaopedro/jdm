import { prisma } from '@jdm/db';
import {
  myTicketSchema,
  myTicketsResponseSchema,
  updateTicketRequestSchema,
  updateTicketResponseSchema,
} from '@jdm/shared/tickets';
import type { Ticket, Event, TicketTier, TicketExtraItem, TicketExtra } from '@prisma/client';
import type { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { requireUser } from '../plugins/auth.js';
import { signTicketCode } from '../services/tickets/codes.js';

type TicketWithRelations = Ticket & {
  event: Event;
  tier: TicketTier;
  extraItems: (TicketExtraItem & { extra: TicketExtra })[];
};

const serializeTicket = (t: TicketWithRelations, app: FastifyInstance) => ({
  id: t.id,
  code: signTicketCode(t.id, app.env),
  status: t.status,
  source: t.source,
  tierName: t.tier.name,
  nickname: t.nickname,
  usedAt: t.usedAt?.toISOString() ?? null,
  createdAt: t.createdAt.toISOString(),
  event: {
    id: t.event.id,
    slug: t.event.slug,
    title: t.event.title,
    coverUrl: t.event.coverObjectKey ? app.uploads.buildPublicUrl(t.event.coverObjectKey) : null,
    startsAt: t.event.startsAt.toISOString(),
    endsAt: t.event.endsAt.toISOString(),
    venueName: t.event.venueName,
    city: t.event.city,
    stateCode: t.event.stateCode,
    type: t.event.type,
  },
  extras: t.extraItems.map((ei) => ({
    id: ei.id,
    extraId: ei.extraId,
    extraName: ei.extra.name,
    code: ei.code,
    status: ei.status,
    usedAt: ei.usedAt?.toISOString() ?? null,
  })),
});

// eslint-disable-next-line @typescript-eslint/require-await
export const meTicketsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/me/tickets', { preHandler: [app.authenticate] }, async (request) => {
    const { sub } = requireUser(request);
    const tickets = await prisma.ticket.findMany({
      where: { userId: sub },
      include: { event: true, tier: true, extraItems: { include: { extra: true } } },
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
      items: sorted.map((t) => serializeTicket(t, app)),
    });
  });

  app.patch('/me/tickets/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { sub } = requireUser(request);
    const { id } = request.params as { id: string };
    const body = updateTicketRequestSchema.parse(request.body);

    const ticket = await prisma.ticket.findUnique({ where: { id }, select: { userId: true } });
    if (!ticket || ticket.userId !== sub) {
      return reply.status(404).send({ error: 'NotFound' });
    }

    const updated = await prisma.ticket.update({
      where: { id },
      data: 'nickname' in body ? { nickname: body.nickname ?? null } : {},
      include: { event: true, tier: true, extraItems: { include: { extra: true } } },
    });

    const parsed = myTicketSchema.parse(serializeTicket(updated, app));
    return updateTicketResponseSchema.parse({ ticket: parsed });
  });
};
