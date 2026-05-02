import { prisma } from '@jdm/db';
import {
  createOrderRequestSchema,
  createOrderResponseSchema,
  getOrderResponseSchema,
} from '@jdm/shared/orders';
import type { FastifyPluginAsync } from 'fastify';

import { requireUser } from '../plugins/auth.js';
import {
  expireSingleOrder,
  ORDER_EXPIRY_MS,
  sweepExpiredOrdersForTier,
} from '../services/orders/expire.js';

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
        .send({ error: 'Conflict', message: 'already has a valid ticket for this event' });
    }

    // Atomically: sweep expired pending orders for this tier, then CAS-reserve a slot.
    const { expiredProviderRefs, reservation } = await prisma.$transaction(async (tx) => {
      const sweep = await sweepExpiredOrdersForTier(tier.id, tx);
      const reservation = await tx.ticketTier.updateMany({
        where: { id: tier.id, quantitySold: { lt: tier.quantityTotal } },
        data: { quantitySold: { increment: 1 } },
      });
      return { expiredProviderRefs: sweep.expiredProviderRefs, reservation };
    });

    if (reservation.count === 0) {
      return reply.status(409).send({ error: 'Conflict', message: 'sold out' });
    }

    // Cancel Stripe PIs for swept orders (best-effort; webhook handles any late payments).
    for (const ref of expiredProviderRefs) {
      app.stripe.cancelPaymentIntent(ref).catch((err) => {
        request.log.warn({ err, providerRef: ref }, 'orders: stripe PI cancel failed after sweep');
      });
    }

    try {
      const expiresAt = new Date(Date.now() + ORDER_EXPIRY_MS);
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
          expiresAt,
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
          amountCents: tier.priceCents,
          currency: tier.currency,
        }),
      );
    } catch (err) {
      await prisma.ticketTier.updateMany({
        where: { id: tier.id, quantitySold: { gt: 0 } },
        data: { quantitySold: { decrement: 1 } },
      });
      throw err;
    }
  });

  app.get('/orders/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { sub } = requireUser(request);
    const { id } = request.params as { id: string };

    const result = await expireSingleOrder(id, sub);
    if (!result) return reply.status(404).send({ error: 'NotFound', message: 'order not found' });

    const { order, wasExpired } = result;

    if (wasExpired && order.providerRef) {
      app.stripe.cancelPaymentIntent(order.providerRef).catch((err) => {
        request.log.warn({ err, orderId: id }, 'orders: stripe PI cancel failed after lazy expiry');
      });
    }

    return reply.status(200).send(
      getOrderResponseSchema.parse({
        orderId: order.id,
        status: order.status,
        expiresAt: order.expiresAt?.toISOString() ?? null,
        amountCents: order.amountCents,
        currency: order.currency,
      }),
    );
  });
};
