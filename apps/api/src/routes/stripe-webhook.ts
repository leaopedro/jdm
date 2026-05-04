import { prisma } from '@jdm/db';
import { Prisma } from '@prisma/client';
import * as Sentry from '@sentry/node';
import type { FastifyPluginAsync } from 'fastify';

import { sendTransactionalPush } from '../services/push/transactional.js';
import {
  issueTicketForPaidOrder,
  OrderNotPendingError,
  TicketAlreadyExistsForEventError,
  TicketRevokedForExtrasOnlyError,
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

const markRefundedAndReleaseReservation = async (orderId: string): Promise<void> => {
  await prisma.$transaction(async (tx) => {
    const updated = await tx.order.updateMany({
      where: { id: orderId, status: 'pending' },
      data: { status: 'refunded' },
    });
    if (updated.count !== 1) return;

    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    if (order.kind !== 'extras_only') {
      await tx.ticketTier.updateMany({
        where: { id: order.tierId, quantitySold: { gte: order.quantity } },
        data: { quantitySold: { decrement: order.quantity } },
      });
    }

    const orderExtras = await tx.orderExtra.findMany({
      where: { orderId },
      select: { extraId: true, quantity: true },
    });
    for (const { extraId, quantity } of orderExtras) {
      await tx.ticketExtra.updateMany({
        where: { id: extraId, quantitySold: { gte: quantity } },
        data: { quantitySold: { decrement: quantity } },
      });
    }
  });
};

// eslint-disable-next-line @typescript-eslint/require-await
export const stripeWebhookRoutes: FastifyPluginAsync = async (app) => {
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => {
    done(null, body);
  });

  app.post('/stripe/webhook', async (request, reply) => {
    const signatureHeader =
      request.headers['stripe-signature'] ?? request.headers['webhook-signature'];
    const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
    if (typeof signature !== 'string' || signature.length === 0) {
      Sentry.captureMessage('stripe webhook: missing signature header', {
        level: 'warning',
        tags: { kind: 'payment-webhook-signature', provider: 'stripe' },
      });
      return reply.status(400).send({ error: 'BadRequest', message: 'missing signature' });
    }
    const raw = request.body as Buffer;
    let event;
    try {
      event = await app.stripe.constructWebhookEvent(raw, signature);
    } catch (sigErr) {
      Sentry.withScope((scope) => {
        scope.setTag('kind', 'payment-webhook-signature');
        scope.setTag('provider', 'stripe');
        scope.setLevel('warning');
        Sentry.captureException(sigErr);
      });
      return reply.status(400).send({ error: 'BadRequest', message: 'invalid signature' });
    }

    const intent = event.data.object as { id?: string; metadata?: Record<string, string> };
    const orderId = intent.metadata?.orderId;

    if (event.type === 'payment_intent.succeeded' && orderId && intent.id) {
      try {
        const issued = await issueTicketForPaidOrder(orderId, intent.id, app.env, intent.metadata);
        const firstTime = await markProcessed(event.id, event);
        request.log.info(
          { orderId, paymentIntentId: intent.id, firstTime },
          'stripe webhook: ticket issued',
        );
        try {
          await sendTransactionalPush(
            {
              userId: issued.userId,
              kind: 'ticket.confirmed',
              dedupeKey: orderId,
              title: 'Ingresso confirmado',
              body: `Seu ingresso para ${issued.eventTitle} está pronto.`,
              data: { orderId, ticketId: issued.ticketId, eventId: issued.eventId },
            },
            { sender: app.push },
          );
        } catch (pushErr) {
          request.log.warn(
            { err: pushErr, orderId },
            'stripe webhook: ticket-confirmed push failed',
          );
          Sentry.withScope((scope) => {
            scope.setTag('kind', 'push-send-failure');
            scope.setTag('push_kind', 'ticket.confirmed');
            scope.setLevel('warning');
            scope.setExtras({ orderId });
            Sentry.captureException(pushErr);
          });
        }
        return reply.status(200).send({ ok: true, deduped: !firstTime });
      } catch (err) {
        // Customer paid but we can't issue a ticket (usually because an
        // unrelated valid ticket exists: comp or premium_grant landed between
        // POST /orders and webhook delivery). Refund so Stripe stops retrying
        // and the customer isn't charged for nothing.
        if (err instanceof TicketAlreadyExistsForEventError) {
          await app.stripe.refund(intent.id, 'duplicate-ticket');
          await markRefundedAndReleaseReservation(orderId);
          await markProcessed(event.id, event);
          request.log.warn(
            { orderId, paymentIntentId: intent.id },
            'stripe webhook: duplicate ticket, refunded',
          );
          return reply.status(200).send({ ok: true, refunded: true });
        }
        if (err instanceof TicketRevokedForExtrasOnlyError) {
          await app.stripe.refund(intent.id, 'ticket-revoked');
          await markRefundedAndReleaseReservation(orderId);
          await markProcessed(event.id, event);
          request.log.warn(
            { orderId, paymentIntentId: intent.id },
            'stripe webhook: extras-only ticket revoked, refunded',
          );
          return reply.status(200).send({ ok: true, refunded: true, reason: 'ticket-revoked' });
        }
        // Order expired between POST /orders and webhook delivery.
        // Customer paid but capacity was already released — refund immediately.
        if (err instanceof OrderNotPendingError) {
          const staleOrder = await prisma.order.findUnique({
            where: { id: orderId },
            select: { status: true },
          });
          if (staleOrder?.status === 'expired') {
            await app.stripe.refund(intent.id, 'order-expired');
            await markProcessed(event.id, event);
            request.log.warn(
              { orderId, paymentIntentId: intent.id },
              'stripe webhook: order expired at payment, refunded',
            );
            return reply.status(200).send({ ok: true, refunded: true, reason: 'expired' });
          }
        }
        throw err;
      }
    }

    const session = event.data.object as {
      id?: string;
      metadata?: Record<string, string>;
      payment_intent?: string;
      payment_status?: string;
    };

    if (event.type === 'checkout.session.completed') {
      let piId = typeof session.payment_intent === 'string' ? session.payment_intent : undefined;
      if (!piId && session.id) {
        piId = (await app.stripe.getCheckoutSessionPaymentIntentId(session.id)) ?? undefined;
      }
      if (session.payment_status !== 'paid' || !piId) {
        return reply.status(200).send({ ok: true, ignored: true });
      }

      let sessionOrderId = session.metadata?.orderId;
      if (!sessionOrderId) {
        const order = await prisma.order.findFirst({
          where: { provider: 'stripe', providerRef: piId },
          select: { id: true },
        });
        sessionOrderId = order?.id;
      }
      if (!sessionOrderId) {
        request.log.warn(
          { sessionId: session.id, piId },
          'stripe webhook: checkout.session.completed missing orderId and no matching order by providerRef',
        );
        return reply.status(200).send({ ok: true, ignored: true });
      }
      try {
        const issued = await issueTicketForPaidOrder(
          sessionOrderId,
          piId,
          app.env,
          session.metadata,
        );
        const firstTime = await markProcessed(event.id, event);
        request.log.info(
          { orderId: sessionOrderId, sessionId: session.id, firstTime },
          'stripe webhook: checkout.session.completed settled order',
        );
        try {
          await sendTransactionalPush(
            {
              userId: issued.userId,
              kind: 'ticket.confirmed',
              dedupeKey: sessionOrderId,
              title: 'Ingresso confirmado',
              body: `Seu ingresso para ${issued.eventTitle} está pronto.`,
              data: {
                orderId: sessionOrderId,
                ticketId: issued.ticketId,
                eventId: issued.eventId,
              },
            },
            { sender: app.push },
          );
        } catch (pushErr) {
          request.log.warn(
            { err: pushErr, orderId: sessionOrderId },
            'stripe webhook: ticket-confirmed push failed (checkout.session)',
          );
        }
        return reply.status(200).send({ ok: true, deduped: !firstTime });
      } catch (err) {
        if (err instanceof TicketAlreadyExistsForEventError) {
          await app.stripe.refund(piId, 'duplicate-ticket');
          await markRefundedAndReleaseReservation(sessionOrderId);
          await markProcessed(event.id, event);
          return reply.status(200).send({ ok: true, refunded: true });
        }
        if (err instanceof TicketRevokedForExtrasOnlyError) {
          await app.stripe.refund(piId, 'ticket-revoked');
          await markRefundedAndReleaseReservation(sessionOrderId);
          await markProcessed(event.id, event);
          return reply.status(200).send({ ok: true, refunded: true, reason: 'ticket-revoked' });
        }
        if (err instanceof OrderNotPendingError) {
          const staleOrder = await prisma.order.findUnique({
            where: { id: sessionOrderId },
            select: { status: true },
          });
          if (staleOrder?.status === 'expired') {
            await app.stripe.refund(piId, 'order-expired');
            await markProcessed(event.id, event);
            return reply.status(200).send({ ok: true, refunded: true, reason: 'expired' });
          }
          // Order already paid by payment_intent.succeeded — idempotent
          if (staleOrder?.status === 'paid') {
            await markProcessed(event.id, event);
            return reply.status(200).send({ ok: true, deduped: true });
          }
        }
        throw err;
      }
    }

    if (event.type === 'checkout.session.expired') {
      const sessionOrderId = session.metadata?.orderId;
      if (sessionOrderId) {
        await prisma.$transaction(async (tx) => {
          const updated = await tx.order.updateMany({
            where: { id: sessionOrderId, status: 'pending' },
            data: { status: 'failed', failedAt: new Date() },
          });
          if (updated.count === 1) {
            const order = await tx.order.findUniqueOrThrow({ where: { id: sessionOrderId } });
            if (order.kind !== 'extras_only') {
              await tx.ticketTier.updateMany({
                where: { id: order.tierId, quantitySold: { gte: order.quantity } },
                data: { quantitySold: { decrement: order.quantity } },
              });
            }
            const orderExtras = await tx.orderExtra.findMany({
              where: { orderId: sessionOrderId },
              select: { extraId: true, quantity: true },
            });
            for (const { extraId, quantity } of orderExtras) {
              await tx.ticketExtra.updateMany({
                where: { id: extraId, quantitySold: { gte: quantity } },
                data: { quantitySold: { decrement: quantity } },
              });
            }
          }
        });
        const firstTime = await markProcessed(event.id, event);
        return reply.status(200).send({ ok: true, deduped: !firstTime });
      }
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
          if (order.kind !== 'extras_only') {
            await tx.ticketTier.updateMany({
              where: { id: order.tierId, quantitySold: { gte: order.quantity } },
              data: { quantitySold: { decrement: order.quantity } },
            });
          }
          // Release extras stock
          const orderExtras = await tx.orderExtra.findMany({
            where: { orderId },
            select: { extraId: true, quantity: true },
          });
          for (const { extraId, quantity } of orderExtras) {
            await tx.ticketExtra.updateMany({
              where: { id: extraId, quantitySold: { gte: quantity } },
              data: { quantitySold: { decrement: quantity } },
            });
          }
        }
      });
      const firstTime = await markProcessed(event.id, event);
      return reply.status(200).send({ ok: true, deduped: !firstTime });
    }

    return reply.status(200).send({ ok: true, ignored: true });
  });
};
