import { prisma } from '@jdm/db';
import { createOrderRequestSchema, createOrderResponseSchema } from '@jdm/shared/orders';
import type { FastifyPluginAsync } from 'fastify';

import { requireUser } from '../plugins/auth.js';

// eslint-disable-next-line @typescript-eslint/require-await
export const orderRoutes: FastifyPluginAsync = async (app) => {
  app.post('/orders', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { sub } = requireUser(request);
    const input = createOrderRequestSchema.parse(request.body);

    if (input.method !== 'card') {
      return reply
        .status(400)
        .send({ error: 'BadRequest', message: 'only card is supported in this release' });
    }

    const event = await prisma.event.findFirst({
      where: { id: input.eventId, status: 'published' },
    });
    if (!event) return reply.status(404).send({ error: 'NotFound', message: 'event not found' });

    const tier = await prisma.ticketTier.findFirst({
      where: { id: input.tierId, eventId: event.id },
    });
    if (!tier) return reply.status(404).send({ error: 'NotFound', message: 'tier not found' });

    const existingTicket = await prisma.ticket.findFirst({
      where: { userId: sub, eventId: event.id, status: 'valid' },
    });
    if (existingTicket) {
      return reply
        .status(409)
        .send({ error: 'Conflict', message: 'already has a ticket for this event' });
    }

    const reservation = await prisma.ticketTier.updateMany({
      where: { id: tier.id, quantitySold: { lt: tier.quantityTotal } },
      data: { quantitySold: { increment: 1 } },
    });
    if (reservation.count === 0) {
      return reply.status(409).send({ error: 'Conflict', message: 'sold out' });
    }

    try {
      const order = await prisma.order.create({
        data: {
          userId: sub,
          eventId: event.id,
          tierId: tier.id,
          amountCents: tier.priceCents,
          currency: tier.currency,
          method: 'card',
          provider: 'stripe',
          status: 'pending',
        },
      });

      const intent = await app.stripe.createPaymentIntent({
        amountCents: tier.priceCents,
        currency: tier.currency,
        idempotencyKey: order.id,
        metadata: {
          orderId: order.id,
          userId: sub,
          eventId: event.id,
          tierId: tier.id,
        },
      });

      await prisma.order.update({
        where: { id: order.id },
        data: { providerRef: intent.id },
      });

      return reply.status(201).send(
        createOrderResponseSchema.parse({
          orderId: order.id,
          status: 'pending',
          clientSecret: intent.clientSecret,
          publishableKey: app.stripe.publishableKey(),
          amountCents: tier.priceCents,
          currency: tier.currency,
        }),
      );
    } catch (err) {
      await prisma.ticketTier.update({
        where: { id: tier.id },
        data: { quantitySold: { decrement: 1 } },
      });
      throw err;
    }
  });
};
