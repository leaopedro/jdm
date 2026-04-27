import { prisma } from '@jdm/db';
import {
  checkInEventsResponseSchema,
  ticketCheckInRequestSchema,
  ticketCheckInResponseSchema,
} from '@jdm/shared/check-in';
import type { FastifyPluginAsync } from 'fastify';

import { requireUser } from '../../plugins/auth.js';
import { recordAudit } from '../../services/admin-audit.js';
import {
  checkInTicket,
  InvalidTicketCodeError,
  TicketNotFoundError,
  TicketRevokedError,
  TicketWrongEventError,
} from '../../services/tickets/check-in.js';

// eslint-disable-next-line @typescript-eslint/require-await
export const adminCheckInRoutes: FastifyPluginAsync = async (app) => {
  app.post('/tickets/check-in', async (request, reply) => {
    const { sub: actorId } = requireUser(request);
    const input = ticketCheckInRequestSchema.parse(request.body);

    try {
      const outcome = await checkInTicket(input, app.env);

      if (outcome.kind === 'admitted') {
        await recordAudit({
          actorId,
          action: 'ticket.check_in',
          entityType: 'ticket',
          entityId: outcome.ticket.id,
          metadata: { eventId: input.eventId },
        });
      }

      const checkedInAt =
        outcome.kind === 'admitted'
          ? outcome.checkedInAt.toISOString()
          : outcome.originalUsedAt.toISOString();

      return reply.send(
        ticketCheckInResponseSchema.parse({
          result: outcome.kind,
          ticket: {
            id: outcome.ticket.id,
            status: outcome.ticket.status,
            checkedInAt,
            tier: {
              id: outcome.ticket.tier.id,
              name: outcome.ticket.tier.name,
            },
            holder: {
              id: outcome.ticket.user.id,
              name: outcome.ticket.user.name,
            },
          },
        }),
      );
    } catch (err) {
      if (err instanceof InvalidTicketCodeError) {
        return reply.status(400).send({ error: 'InvalidTicketCode', message: err.message });
      }
      if (err instanceof TicketNotFoundError) {
        return reply.status(404).send({ error: 'TicketNotFound', message: err.message });
      }
      if (err instanceof TicketWrongEventError) {
        return reply.status(409).send({ error: 'TicketWrongEvent', message: err.message });
      }
      if (err instanceof TicketRevokedError) {
        return reply.status(409).send({ error: 'TicketRevoked', message: err.message });
      }
      throw err;
    }
  });

  app.get('/check-in/events', async (_request, reply) => {
    const cutoff = new Date(Date.now() - 24 * 3600_000);
    const events = await prisma.event.findMany({
      where: {
        status: 'published',
        endsAt: { gte: cutoff },
      },
      orderBy: [{ startsAt: 'asc' }],
      select: {
        id: true,
        slug: true,
        title: true,
        startsAt: true,
        endsAt: true,
        venueName: true,
        city: true,
        stateCode: true,
      },
    });

    return reply.send(
      checkInEventsResponseSchema.parse({
        items: events.map((e) => ({
          id: e.id,
          slug: e.slug,
          title: e.title,
          startsAt: e.startsAt.toISOString(),
          endsAt: e.endsAt.toISOString(),
          venueName: e.venueName,
          city: e.city,
          stateCode: e.stateCode,
        })),
      }),
    );
  });
};
