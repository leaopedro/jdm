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

// Record AFTER dispatch succeeds — matching Stripe handler pattern.
// issueTicketForPaidOrder is idempotent (already-paid path returns existing
// ticket), so running dispatch on a redelivery is safe. Recording first would
// strand orders in `pending` if dispatch crashes.
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

// eslint-disable-next-line @typescript-eslint/require-await
export const abacatepayWebhookRoutes: FastifyPluginAsync = async (app) => {
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => {
    done(null, body);
  });

  app.post('/abacatepay/webhook', async (request, reply) => {
    if (!app.abacatepay) {
      return reply
        .status(503)
        .send({ error: 'ServiceUnavailable', message: 'provider not configured' });
    }

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

    if (event.event === 'charge.paid') {
      const billingId = extractBillingId(event.data);
      if (!billingId) {
        Sentry.captureMessage('abacatepay webhook: charge.paid missing billingId', {
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
          message: `abacatepay charge.paid: no order for billingId=${billingId}`,
          level: 'warning',
        });
        request.log.warn(
          { eventId: event.id, billingId },
          'abacatepay webhook: charge.paid no matching order',
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
        return reply.status(200).send({ ok: true, deduped: !firstTime });
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
          return reply
            .status(200)
            .send({ ok: true, manualRefund: true, reason: 'duplicate-ticket' });
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
          return reply.status(200).send({ ok: true, manualRefund: true, reason: 'ticket-revoked' });
        }
        if (err instanceof OrderNotPendingError) {
          const staleOrder = await prisma.order.findUnique({
            where: { id: order.id },
            select: { status: true },
          });
          if (staleOrder?.status === 'paid') {
            await markProcessed(event.id, event);
            return reply.status(200).send({ ok: true, deduped: true });
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
            return reply
              .status(200)
              .send({ ok: true, manualRefund: true, reason: 'order-expired' });
          }
        }
        throw err;
      }
    }

    // Non-charge.paid events: log and mark processed
    const firstTime = await markProcessed(event.id, event);
    if (!firstTime) {
      request.log.info({ eventId: event.id }, 'abacatepay webhook: dedup skip');
      return reply.status(200).send({ ok: true, deduped: true });
    }

    request.log.info(
      { eventId: event.id, eventType: event.event, devMode: event.devMode },
      'abacatepay webhook: received',
    );

    return reply.status(200).send({ ok: true });
  });
};
