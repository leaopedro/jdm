import { prisma } from '@jdm/db';
import { Prisma } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';

import { issueTicketForPaidOrder } from '../services/tickets/issue.js';

// eslint-disable-next-line @typescript-eslint/require-await
export const stripeWebhookRoutes: FastifyPluginAsync = async (app) => {
  // Scoped raw-body parser: Stripe signature verification needs exact bytes.
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

    // Dedupe by (provider, event.id) before any side effects.
    try {
      await prisma.paymentWebhookEvent.create({
        data: {
          provider: 'stripe',
          eventId: event.id,
          payload: event as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return reply.status(200).send({ ok: true, deduped: true });
      }
      throw err;
    }

    const intent = event.data.object as { id?: string; metadata?: Record<string, string> };
    const orderId = intent.metadata?.orderId;

    if (event.type === 'payment_intent.succeeded' && orderId && intent.id) {
      await issueTicketForPaidOrder(orderId, intent.id, app.env);
      request.log.info({ orderId, paymentIntentId: intent.id }, 'ticket issued');
      return reply.status(200).send({ ok: true });
    }

    if (event.type === 'payment_intent.payment_failed' && orderId) {
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      if (order && order.status === 'pending') {
        await prisma.$transaction([
          prisma.order.update({
            where: { id: order.id },
            data: { status: 'failed', failedAt: new Date() },
          }),
          prisma.ticketTier.update({
            where: { id: order.tierId },
            data: { quantitySold: { decrement: 1 } },
          }),
        ]);
      }
      return reply.status(200).send({ ok: true });
    }

    return reply.status(200).send({ ok: true, ignored: true });
  });
};
