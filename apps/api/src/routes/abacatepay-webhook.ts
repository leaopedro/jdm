import { timingSafeEqual } from 'node:crypto';

import rateLimit from '@fastify/rate-limit';
import { prisma } from '@jdm/db';
import { Prisma } from '@prisma/client';
import * as Sentry from '@sentry/node';
import type { FastifyPluginAsync } from 'fastify';

import type { AbacateWebhookEvent } from '../services/abacatepay/index.js';
import { sendTransactionalPush } from '../services/push/transactional.js';
import {
  issueTicketForPaidOrder,
  OrderNotPendingError,
  TicketAlreadyExistsForEventError,
  TicketRevokedForExtrasOnlyError,
} from '../services/tickets/issue.js';

const ACCEPTED_EVENTS = new Set([
  'transparent.completed',
  'transparent.refunded',
  'transparent.disputed',
  'transparent.lost',
]);

const markProcessed = async (eventId: string, payload: unknown): Promise<boolean> => {
  try {
    await prisma.paymentWebhookEvent.create({
      data: {
        provider: 'abacatepay',
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

const extractBillingId = (data: Record<string, unknown>): string | undefined => {
  if (typeof data.billing === 'object' && data.billing !== null) {
    const billing = data.billing as Record<string, unknown>;
    if (typeof billing.id === 'string') return billing.id;
  }
  if (typeof data.billingId === 'string') return data.billingId;
  return undefined;
};

const flagManualRefund = (context: {
  orderId: string;
  providerRef: string;
  userId: string;
  eventId: string;
  reason: string;
}) => {
  Sentry.withScope((scope) => {
    scope.setTag('kind', 'pix-manual-refund-needed');
    scope.setTag('provider', 'abacatepay');
    scope.setTag('reason', context.reason);
    scope.setExtras({
      orderId: context.orderId,
      providerRef: context.providerRef,
      userId: context.userId,
      eventId: context.eventId,
    });
    Sentry.captureMessage(`abacatepay: manual refund needed (${context.reason})`, 'error');
  });
};

const constantTimeEquals = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
};

export const abacatepayWebhookRoutes: FastifyPluginAsync = async (app) => {
  await app.register(rateLimit, {
    max: 60,
    timeWindow: '1 minute',
    keyGenerator: (req) => req.ip,
  });

  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => {
    done(null, body);
  });

  app.post('/abacatepay/webhook', { bodyLimit: 32_768 }, async (request, reply) => {
    if (!app.abacatepay) {
      return reply
        .status(503)
        .send({ error: 'ServiceUnavailable', message: 'provider not configured' });
    }

    const webhookSecret = app.env.ABACATEPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return reply
        .status(503)
        .send({ error: 'ServiceUnavailable', message: 'provider not configured' });
    }

    // C2/M1: URL-secret check first — proves this payload was destined for our merchant
    const querySecret = (request.query as Record<string, unknown>).webhookSecret;
    if (typeof querySecret !== 'string' || !constantTimeEquals(querySecret, webhookSecret)) {
      Sentry.addBreadcrumb({
        category: 'webhook',
        message: 'abacatepay webhook: webhookSecret mismatch',
        level: 'warning',
      });
      return reply.status(401).send({ error: 'Unauthorized', message: 'invalid secret' });
    }

    // C1: Signature check — proves payload was signed by AbacatePay (public key HMAC)
    const signature = request.headers['x-webhook-signature'];
    if (typeof signature !== 'string' || signature.length === 0) {
      Sentry.captureMessage('abacatepay webhook: missing signature header', {
        level: 'warning',
        tags: { kind: 'payment-webhook-signature', provider: 'abacatepay' },
      });
      return reply.status(401).send({ error: 'Unauthorized', message: 'missing signature' });
    }

    const raw = request.body as Buffer;
    try {
      app.abacatepay.verifyWebhookSignature(raw, signature);
    } catch (sigErr) {
      Sentry.withScope((scope) => {
        scope.setTag('kind', 'payment-webhook-signature');
        scope.setTag('provider', 'abacatepay');
        scope.setLevel('warning');
        Sentry.captureException(sigErr);
      });
      return reply.status(401).send({ error: 'Unauthorized', message: 'invalid signature' });
    }

    let event: AbacateWebhookEvent;
    try {
      event = JSON.parse(raw.toString()) as AbacateWebhookEvent;
    } catch {
      return reply.status(400).send({ error: 'BadRequest', message: 'invalid JSON' });
    }

    if (!event.id || !event.event) {
      return reply.status(400).send({ error: 'BadRequest', message: 'missing id or event field' });
    }

    // H1: Reject sandbox/devMode events in production
    if (event.devMode && app.env.NODE_ENV === 'production') {
      request.log.warn(
        { eventId: event.id, eventType: event.event },
        'abacatepay webhook: rejected devMode event in production',
      );
      return reply.status(200).send({ ok: true });
    }

    // L6: Reject unknown event types
    if (!ACCEPTED_EVENTS.has(event.event)) {
      request.log.info(
        { eventId: event.id, eventType: event.event },
        'abacatepay webhook: unknown event type, ignoring',
      );
      await markProcessed(event.id, event);
      return reply.status(200).send({ ok: true });
    }

    // C3: Pix payment success — documented event name is transparent.completed
    if (event.event === 'transparent.completed') {
      const billingId = extractBillingId(event.data);
      if (!billingId) {
        Sentry.captureMessage('abacatepay webhook: transparent.completed missing billingId', {
          level: 'warning',
          tags: { kind: 'webhook-payload-invalid', provider: 'abacatepay' },
          extra: { eventId: event.id },
        });
        await markProcessed(event.id, event);
        return reply.status(200).send({ ok: true });
      }

      const order = await prisma.order.findFirst({
        where: { provider: 'abacatepay', providerRef: billingId },
        select: { id: true, userId: true, eventId: true },
      });

      if (!order) {
        Sentry.addBreadcrumb({
          category: 'webhook',
          message: `abacatepay transparent.completed: no order for billingId=${billingId}`,
          level: 'warning',
        });
        request.log.warn(
          { eventId: event.id, billingId },
          'abacatepay webhook: transparent.completed no matching order',
        );
        await markProcessed(event.id, event);
        return reply.status(200).send({ ok: true });
      }

      try {
        const issued = await issueTicketForPaidOrder(order.id, billingId, app.env);
        const firstTime = await markProcessed(event.id, event);
        request.log.info(
          { orderId: order.id, billingId, firstTime },
          'abacatepay webhook: ticket issued',
        );
        try {
          await sendTransactionalPush(
            {
              userId: issued.userId,
              kind: 'ticket.confirmed',
              dedupeKey: order.id,
              title: 'Pagamento confirmado',
              body: `Seu ingresso para ${issued.eventTitle} está pronto.`,
              data: { orderId: order.id, ticketId: issued.ticketId, eventId: issued.eventId },
            },
            { sender: app.push },
          );
        } catch (pushErr) {
          request.log.warn(
            { err: pushErr, orderId: order.id },
            'abacatepay webhook: ticket-confirmed push failed',
          );
          Sentry.withScope((scope) => {
            scope.setTag('kind', 'push-send-failure');
            scope.setTag('push_kind', 'ticket.confirmed');
            scope.setLevel('warning');
            scope.setExtras({ orderId: order.id });
            Sentry.captureException(pushErr);
          });
        }
        // M2: Don't leak internal state in response
        return reply.status(200).send({ ok: true });
      } catch (err) {
        if (err instanceof TicketAlreadyExistsForEventError) {
          flagManualRefund({
            orderId: order.id,
            providerRef: billingId,
            userId: order.userId,
            eventId: order.eventId,
            reason: 'duplicate-ticket',
          });
          await markProcessed(event.id, event);
          request.log.warn(
            { orderId: order.id, billingId },
            'abacatepay webhook: duplicate ticket, manual refund flagged',
          );
          return reply.status(200).send({ ok: true });
        }
        if (err instanceof TicketRevokedForExtrasOnlyError) {
          flagManualRefund({
            orderId: order.id,
            providerRef: billingId,
            userId: order.userId,
            eventId: order.eventId,
            reason: 'ticket-revoked',
          });
          await markProcessed(event.id, event);
          request.log.warn(
            { orderId: order.id, billingId },
            'abacatepay webhook: extras-only ticket revoked, manual refund flagged',
          );
          return reply.status(200).send({ ok: true });
        }
        if (err instanceof OrderNotPendingError) {
          const staleOrder = await prisma.order.findUnique({
            where: { id: order.id },
            select: { status: true },
          });
          if (staleOrder?.status === 'paid') {
            await markProcessed(event.id, event);
            return reply.status(200).send({ ok: true });
          }
          if (staleOrder?.status === 'expired') {
            flagManualRefund({
              orderId: order.id,
              providerRef: billingId,
              userId: order.userId,
              eventId: order.eventId,
              reason: 'order-expired',
            });
            await markProcessed(event.id, event);
            request.log.warn(
              { orderId: order.id, billingId },
              'abacatepay webhook: order expired, manual refund flagged',
            );
            return reply.status(200).send({ ok: true });
          }
          // H2: Handle cancelled + any other non-pending status — return 200 to stop retries
          flagManualRefund({
            orderId: order.id,
            providerRef: billingId,
            userId: order.userId,
            eventId: order.eventId,
            reason: `order-${staleOrder?.status ?? 'unknown'}`,
          });
          await markProcessed(event.id, event);
          request.log.warn(
            { orderId: order.id, billingId, status: staleOrder?.status },
            'abacatepay webhook: order not pending, manual refund flagged',
          );
          return reply.status(200).send({ ok: true });
        }
        throw err;
      }
    }

    // Non-payment events: log and mark processed
    const firstTime = await markProcessed(event.id, event);
    if (!firstTime) {
      request.log.info({ eventId: event.id }, 'abacatepay webhook: dedup skip');
      return reply.status(200).send({ ok: true });
    }

    request.log.info(
      { eventId: event.id, eventType: event.event, devMode: event.devMode },
      'abacatepay webhook: received',
    );

    return reply.status(200).send({ ok: true });
  });
};
