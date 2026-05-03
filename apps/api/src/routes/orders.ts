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
import { reserveExtras, validateTickets } from '../services/orders/validate-tickets.js';

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

    // Validate per-ticket inputs and fetch extras data inside transaction.
    // Atomically: validate + reserve extras, sweep expired orders, CAS-reserve tier slot.
    let validationResult: Awaited<ReturnType<typeof validateTickets>>;
    let expiredProviderRefs: string[];
    let reserved = false;

    try {
      const txResult = await prisma.$transaction(async (tx) => {
        const validation = await validateTickets(input.tickets, tier, event.id, tx, sub);
        const sweep = await sweepExpiredOrdersForTier(tier.id, tx);
        const reservation = await tx.ticketTier.updateMany({
          where: { id: tier.id, quantitySold: { lt: tier.quantityTotal } },
          data: { quantitySold: { increment: 1 } },
        });
        if (reservation.count === 0) {
          return { soldOut: true, validation, expiredProviderRefs: sweep.expiredProviderRefs };
        }
        // Throws EXTRA_SOLD_OUT if race condition detected — rolls back tier increment atomically
        await reserveExtras(validation.extraStock, tx);
        return { soldOut: false, validation, expiredProviderRefs: sweep.expiredProviderRefs };
      });

      if (txResult.soldOut) {
        return reply.status(409).send({ error: 'Conflict', message: 'sold out' });
      }

      validationResult = txResult.validation;
      expiredProviderRefs = txResult.expiredProviderRefs;
      reserved = true;
    } catch (err) {
      const coded = err as Error & { code?: string };
      if (
        coded.code === 'MISSING_CAR_ID' ||
        coded.code === 'CAR_NOT_OWNED' ||
        coded.code === 'DUPLICATE_EXTRA'
      ) {
        return reply.status(422).send({ error: 'UnprocessableEntity', message: coded.message });
      }
      if (coded.code === 'EXTRA_NOT_FOUND') {
        return reply.status(404).send({ error: 'NotFound', message: coded.message });
      }
      if (coded.code === 'EXTRA_SOLD_OUT') {
        return reply.status(409).send({ error: 'Conflict', message: coded.message });
      }
      throw err;
    }

    // Cancel Stripe PIs for swept orders (best-effort; webhook handles any late payments).
    for (const ref of expiredProviderRefs) {
      app.stripe.cancelPaymentIntent(ref).catch((cancelErr) => {
        request.log.warn(
          { err: cancelErr, providerRef: ref },
          'orders: stripe PI cancel failed after sweep',
        );
      });
    }

    const amountCents = tier.priceCents * input.tickets.length + validationResult.totalExtrasCents;

    try {
      const expiresAt = new Date(Date.now() + ORDER_EXPIRY_MS);
      const order = await prisma.order.create({
        data: {
          userId: sub,
          eventId: event.id,
          tierId: tier.id,
          amountCents,
          currency: tier.currency,
          method: 'card',
          provider: 'stripe',
          status: 'pending',
          expiresAt,
        },
      });

      // Create OrderExtra rows for each per-ticket extra
      if (validationResult.extraEntries.length > 0) {
        await prisma.orderExtra.createMany({
          data: validationResult.extraEntries.map(({ extraId, quantity }) => ({
            orderId: order.id,
            extraId,
            quantity,
          })),
          skipDuplicates: true,
        });
      }

      const intent = await app.stripe.createPaymentIntent({
        amountCents,
        currency: tier.currency,
        idempotencyKey: order.id,
        metadata: {
          orderId: order.id,
          userId: sub,
          eventId: event.id,
          tierId: tier.id,
          tickets: JSON.stringify(validationResult.ticketsMetadata),
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
          amountCents,
          currency: tier.currency,
        }),
      );
    } catch (err) {
      if (reserved) {
        await prisma.ticketTier.updateMany({
          where: { id: tier.id, quantitySold: { gt: 0 } },
          data: { quantitySold: { decrement: 1 } },
        });
      }
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
      app.stripe.cancelPaymentIntent(order.providerRef).catch((cancelErr) => {
        request.log.warn(
          { err: cancelErr, orderId: id },
          'orders: stripe PI cancel failed after lazy expiry',
        );
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
