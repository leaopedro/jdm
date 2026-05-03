import { prisma } from '@jdm/db';
import { Prisma } from '@prisma/client';
import * as Sentry from '@sentry/node';
import type { FastifyPluginAsync } from 'fastify';

import type { AbacateWebhookEvent } from '../services/abacatepay/index.js';

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

    const firstTime = await markProcessed(event.id, event);
    if (!firstTime) {
      Sentry.addBreadcrumb({
        category: 'webhook',
        message: `abacatepay dedup skip: ${event.id}`,
        level: 'info',
      });
      request.log.info({ eventId: event.id }, 'abacatepay webhook: dedup skip');
      return reply.status(200).send({ ok: true, deduped: true });
    }

    // Event dispatch — handlers added in JDMA-15 (transparent.completed)
    request.log.info(
      { eventId: event.id, eventType: event.event, devMode: event.devMode },
      'abacatepay webhook: received',
    );

    return reply.status(200).send({ ok: true });
  });
};
