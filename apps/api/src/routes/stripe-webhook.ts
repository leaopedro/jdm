import { prisma } from '@jdm/db';
import { Prisma } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';

import {
  issueTicketForPaidOrder,
  TicketAlreadyExistsForEventError,
} from '../services/tickets/issue.js';

// Record the event as seen AFTER dispatch succeeds. If we did it first, a
// dispatch failure would leave the event marked-seen forever and Stripe
// retries would short-circuit at the dedup branch, stranding the order in
// `pending`. issueTicketForPaidOrder is idempotent (already-paid path), and
// the failed-path handler uses count-guarded updateMany, so running dispatch
// on a redelivery is safe.
const markProcessed = async (eventId: string, payload: unknown): Promise<boolean> => {
  try {
    await prisma.paymentWebhookEvent.create({
      data: {
        provider: 'stripe',
        eventId,
        payload: payload as Prisma.InputJsonValue,
      },
    });
    return true;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return false;
    }
    throw err;
  }
};

// eslint-disable-next-line @typescript-eslint/require-await
export const stripeWebhookRoutes: FastifyPluginAsync = async (app) => {
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => {
    done(null, body);
  });

  app.post('/stripe/webhook', async (request, reply) => {
    const signature = request.headers['stripe-signature'];
    if (typeof signature !== 'string' || signature.length === 0) {
      return reply.status(400).send({ error: 'BadRequest', message: 'missing signature' });
    }
    const raw = request.body as Buffer;
    let event;
    try {
      event = app.stripe.constructWebhookEvent(raw, signature);
    } catch {
      return reply.status(400).send({ error: 'BadRequest', message: 'invalid signature' });
    }

    const intent = event.data.object as { id?: string; metadata?: Record<string, string> };
    const orderId = intent.metadata?.orderId;

    if (event.type === 'payment_intent.succeeded' && orderId && intent.id) {
      try {
        await issueTicketForPaidOrder(orderId, intent.id, app.env);
      } catch (err) {
        // Customer paid but we can't issue a ticket (usually because an
        // unrelated valid ticket exists: comp or premium_grant landed between
        // POST /orders and webhook delivery). Refund so Stripe stops retrying
        // and the customer isn't charged for nothing.
        if (err instanceof TicketAlreadyExistsForEventError) {
          await app.stripe.refund(intent.id, 'duplicate-ticket');
          await markProcessed(event.id, event);
          request.log.warn(
            { orderId, paymentIntentId: intent.id },
            'stripe webhook: duplicate ticket, refunded',
          );
          return reply.status(200).send({ ok: true, refunded: true });
        }
        throw err;
      }
      const firstTime = await markProcessed(event.id, event);
      request.log.info(
        { orderId, paymentIntentId: intent.id, firstTime },
        'stripe webhook: ticket issued',
      );
      return reply.status(200).send({ ok: true, deduped: !firstTime });
    }

    if (event.type === 'payment_intent.payment_failed' && orderId) {
      // Atomic: either both the order flip and the capacity release commit,
      // or neither does. Without the transaction, a crash between the two
      // writes would strand the reservation (status=failed, quantitySold
      // still incremented) because Stripe retries would skip release
      // (updateMany count=0 on the no-longer-pending order).
      await prisma.$transaction(async (tx) => {
        const updated = await tx.order.updateMany({
          where: { id: orderId, status: 'pending' },
          data: { status: 'failed', failedAt: new Date() },
        });
        if (updated.count === 1) {
          const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
          await tx.ticketTier.updateMany({
            where: { id: order.tierId, quantitySold: { gt: 0 } },
            data: { quantitySold: { decrement: 1 } },
          });
        }
      });
      const firstTime = await markProcessed(event.id, event);
      return reply.status(200).send({ ok: true, deduped: !firstTime });
    }

    return reply.status(200).send({ ok: true, ignored: true });
  });
};
