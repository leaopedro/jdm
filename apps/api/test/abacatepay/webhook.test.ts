import { prisma } from '@jdm/db';
import type { OrderStatus, PaymentProvider } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import { type Env, loadEnv } from '../../src/env.js';
import { buildFakeAbacatePay, type FakeAbacatePay } from '../../src/services/abacatepay/fake.js';
import { DevPushSender } from '../../src/services/push/dev.js';
import { buildFakeStripe } from '../../src/services/stripe/fake.js';
import { createUser, resetDatabase } from '../helpers.js';

const baseEnv = loadEnv();
const TEST_WEBHOOK_SECRET = 'test-webhook-secret-abc123';
const env: Env = { ...baseEnv, ABACATEPAY_WEBHOOK_SECRET: TEST_WEBHOOK_SECRET };

const webhookUrl = `/abacatepay/webhook?webhookSecret=${TEST_WEBHOOK_SECRET}`;

const makePayload = (
  overrides: Partial<{
    id: string;
    event: string;
    devMode: boolean;
    data: Record<string, unknown>;
  }> = {},
) =>
  JSON.stringify({
    id: overrides.id ?? `evt_${Date.now()}`,
    event: overrides.event ?? 'transparent.completed',
    devMode: overrides.devMode ?? false,
    data: overrides.data ?? { billing: { id: 'pix_123' }, amount: 5000 },
  });

const makeTransparentCompletedPayload = (billingId: string, eventId?: string) =>
  JSON.stringify({
    id: eventId ?? `evt_${Date.now()}`,
    event: 'transparent.completed',
    devMode: false,
    data: { billing: { id: billingId } },
  });

const seedEventTierOrder = async (
  userId: string,
  opts?: { provider?: PaymentProvider; providerRef?: string; status?: OrderStatus },
) => {
  const event = await prisma.event.create({
    data: {
      slug: `e-${Math.random().toString(36).slice(2, 8)}`,
      title: 'Evento Teste',
      description: 'desc',
      startsAt: new Date(Date.now() + 86400_000),
      endsAt: new Date(Date.now() + 90000_000),
      venueName: 'v',
      venueAddress: 'a',
      city: 'São Paulo',
      stateCode: 'SP',
      type: 'meeting',
      status: 'published',
      capacity: 5,
      maxTicketsPerUser: 1,
      publishedAt: new Date(),
    },
  });
  const tier = await prisma.ticketTier.create({
    data: {
      eventId: event.id,
      name: 'Geral',
      priceCents: 5000,
      quantityTotal: 5,
      quantitySold: 1,
      sortOrder: 0,
    },
  });
  const order = await prisma.order.create({
    data: {
      userId,
      eventId: event.id,
      tierId: tier.id,
      amountCents: 5000,
      quantity: 1,
      method: 'pix',
      provider: opts?.provider ?? 'abacatepay',
      providerRef: opts?.providerRef ?? `pix_${Math.random().toString(36).slice(2, 10)}`,
      status: opts?.status ?? 'pending',
    },
  });
  return { event, tier, order };
};

describe('POST /abacatepay/webhook', () => {
  let app: FastifyInstance;
  let abacatepay: FakeAbacatePay;
  let push: DevPushSender;

  beforeEach(async () => {
    await resetDatabase();
    abacatepay = buildFakeAbacatePay();
    push = new DevPushSender();
    const stripe = buildFakeStripe();
    app = await buildApp(env, { stripe, abacatepay, push });
  });

  afterEach(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  // --- URL-secret (C2) ---

  it('rejects missing webhookSecret query param with 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/abacatepay/webhook',
      headers: {
        'content-type': 'application/json',
        'x-webhook-signature': 'valid-sig',
      },
      payload: makePayload(),
    });
    expect(res.statusCode).toBe(401);
    const body: { error: string } = res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('rejects wrong webhookSecret query param with 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/abacatepay/webhook?webhookSecret=wrong-secret',
      headers: {
        'content-type': 'application/json',
        'x-webhook-signature': 'valid-sig',
      },
      payload: makePayload(),
    });
    expect(res.statusCode).toBe(401);
  });

  // --- Signature (C1) ---

  it('rejects missing signature with 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: webhookUrl,
      headers: { 'content-type': 'application/json' },
      payload: makePayload(),
    });
    expect(res.statusCode).toBe(401);
    const body: { error: string } = res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('rejects invalid signature with 401', async () => {
    abacatepay.nextSignatureValid = false;
    const res = await app.inject({
      method: 'POST',
      url: webhookUrl,
      headers: {
        'content-type': 'application/json',
        'x-webhook-signature': 'bad-sig',
      },
      payload: makePayload(),
    });
    expect(res.statusCode).toBe(401);
  });

  // --- devMode (H1) ---

  it('skips processing for devMode events in production', async () => {
    const prodEnv: Env = {
      ...env,
      NODE_ENV: 'production',
      RESEND_API_KEY: 'fake-resend-key',
      SENTRY_DSN: undefined,
      WORKER_ENABLED: false,
    };
    const prodApp = await buildApp(prodEnv, {
      stripe: buildFakeStripe(),
      abacatepay: buildFakeAbacatePay(),
      push: new DevPushSender(),
    });

    const payload = makePayload({ id: 'evt_devmode_1', devMode: true });
    const res = await prodApp.inject({
      method: 'POST',
      url: webhookUrl,
      headers: {
        'content-type': 'application/json',
        'x-webhook-signature': 'valid-sig',
      },
      payload,
    });

    expect(res.statusCode).toBe(200);
    // Event should NOT be stored — it was rejected
    const record = await prisma.paymentWebhookEvent.findUnique({
      where: { provider_eventId: { provider: 'abacatepay', eventId: 'evt_devmode_1' } },
    });
    expect(record).toBeNull();
    await prodApp.close();
  });

  it('allows devMode events in non-production', async () => {
    const { user } = await createUser({ verified: true });
    const { order } = await seedEventTierOrder(user.id);
    const payload = JSON.stringify({
      id: 'evt_devmode_nonprod',
      event: 'transparent.completed',
      devMode: true,
      data: { billing: { id: order.providerRef } },
    });

    const res = await app.inject({
      method: 'POST',
      url: webhookUrl,
      headers: {
        'content-type': 'application/json',
        'x-webhook-signature': 'valid-sig',
      },
      payload,
    });
    expect(res.statusCode).toBe(200);

    const updatedOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updatedOrder.status).toBe('paid');
  });

  // --- Basic acceptance ---

  it('accepts valid request and returns 200 for non-payment events', async () => {
    const payload = makePayload({ id: 'evt_valid_1', event: 'transparent.refunded' });
    const res = await app.inject({
      method: 'POST',
      url: webhookUrl,
      headers: {
        'content-type': 'application/json',
        'x-webhook-signature': 'valid-sig',
      },
      payload,
    });
    expect(res.statusCode).toBe(200);
    const body: { ok: boolean } = res.json();
    expect(body.ok).toBe(true);
  });

  it('returns 200 for unknown event types (L6 allowlist)', async () => {
    const payload = makePayload({ id: 'evt_unknown_1', event: 'some.unknown.event' });
    const res = await app.inject({
      method: 'POST',
      url: webhookUrl,
      headers: {
        'content-type': 'application/json',
        'x-webhook-signature': 'valid-sig',
      },
      payload,
    });
    expect(res.statusCode).toBe(200);
    // Still stored for audit
    const record = await prisma.paymentWebhookEvent.findUnique({
      where: { provider_eventId: { provider: 'abacatepay', eventId: 'evt_unknown_1' } },
    });
    expect(record).not.toBeNull();
  });

  it('deduplicates: second delivery of same event', async () => {
    const payload = makePayload({ id: 'evt_dedup_1', event: 'transparent.refunded' });
    const inject = () =>
      app.inject({
        method: 'POST',
        url: webhookUrl,
        headers: {
          'content-type': 'application/json',
          'x-webhook-signature': 'valid-sig',
        },
        payload,
      });

    const first = await inject();
    expect(first.statusCode).toBe(200);

    const second = await inject();
    expect(second.statusCode).toBe(200);
    const secondBody: { ok: boolean } = second.json();
    expect(secondBody.ok).toBe(true);
  });

  it('stores webhook event in PaymentWebhookEvent table', async () => {
    const eventId = `evt_store_${Date.now()}`;
    const payload = makePayload({ id: eventId, event: 'transparent.refunded' });
    await app.inject({
      method: 'POST',
      url: webhookUrl,
      headers: {
        'content-type': 'application/json',
        'x-webhook-signature': 'valid-sig',
      },
      payload,
    });

    const record = await prisma.paymentWebhookEvent.findUnique({
      where: { provider_eventId: { provider: 'abacatepay', eventId } },
    });
    expect(record).not.toBeNull();
    expect(record!.provider).toBe('abacatepay');
  });

  it('rejects malformed JSON with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: webhookUrl,
      headers: {
        'content-type': 'application/json',
        'x-webhook-signature': 'valid-sig',
      },
      payload: Buffer.from('not json{{{'),
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects payload missing id field with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: webhookUrl,
      headers: {
        'content-type': 'application/json',
        'x-webhook-signature': 'valid-sig',
      },
      payload: JSON.stringify({ event: 'transparent.completed', data: {} }),
    });
    expect(res.statusCode).toBe(400);
  });

  // --- transparent.completed handler tests ---

  describe('transparent.completed', () => {
    it('marks order paid and issues ticket', async () => {
      const { user } = await createUser({ verified: true });
      const { order, event } = await seedEventTierOrder(user.id);
      const payload = makeTransparentCompletedPayload(order.providerRef!, 'evt_paid_1');

      const res = await app.inject({
        method: 'POST',
        url: webhookUrl,
        headers: {
          'content-type': 'application/json',
          'x-webhook-signature': 'valid-sig',
        },
        payload,
      });

      expect(res.statusCode).toBe(200);
      const body: { ok: boolean } = res.json();
      expect(body.ok).toBe(true);

      const updatedOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(updatedOrder.status).toBe('paid');
      expect(updatedOrder.paidAt).not.toBeNull();

      const ticket = await prisma.ticket.findFirst({
        where: { orderId: order.id, userId: user.id, eventId: event.id },
      });
      expect(ticket).not.toBeNull();
      expect(ticket!.source).toBe('purchase');
      expect(ticket!.status).toBe('valid');
    });

    it('sends push notification on first payment', async () => {
      const { user } = await createUser({ verified: true });
      const { order } = await seedEventTierOrder(user.id);

      await prisma.deviceToken.create({
        data: { userId: user.id, expoPushToken: 'ExponentPushToken[test]', platform: 'ios' },
      });

      const payload = makeTransparentCompletedPayload(order.providerRef!, 'evt_push_1');
      await app.inject({
        method: 'POST',
        url: webhookUrl,
        headers: {
          'content-type': 'application/json',
          'x-webhook-signature': 'valid-sig',
        },
        payload,
      });

      expect(push.captured.length).toBe(1);
      expect(push.captured[0]!.title).toBe('Pagamento confirmado');
    });

    it('replay does not create duplicate ticket', async () => {
      const { user } = await createUser({ verified: true });
      const { order } = await seedEventTierOrder(user.id);
      const eventId = 'evt_replay_1';
      const payload = makeTransparentCompletedPayload(order.providerRef!, eventId);

      const inject = () =>
        app.inject({
          method: 'POST',
          url: webhookUrl,
          headers: {
            'content-type': 'application/json',
            'x-webhook-signature': 'valid-sig',
          },
          payload,
        });

      const first = await inject();
      expect(first.statusCode).toBe(200);

      const second = await inject();
      expect(second.statusCode).toBe(200);

      const tickets = await prisma.ticket.findMany({ where: { orderId: order.id } });
      expect(tickets).toHaveLength(1);
    });

    it('returns 200 when ticket already exists (duplicate-ticket)', async () => {
      const { user } = await createUser({ verified: true });
      const { order, event } = await seedEventTierOrder(user.id);

      await prisma.ticket.create({
        data: {
          userId: user.id,
          eventId: event.id,
          tierId: order.tierId,
          source: 'comp',
          status: 'valid',
        },
      });

      const payload = makeTransparentCompletedPayload(order.providerRef!, 'evt_conflict_1');
      const res = await app.inject({
        method: 'POST',
        url: webhookUrl,
        headers: {
          'content-type': 'application/json',
          'x-webhook-signature': 'valid-sig',
        },
        payload,
      });

      expect(res.statusCode).toBe(200);
      const body: { ok: boolean } = res.json();
      expect(body.ok).toBe(true);
      // M2: No internal state leaked
      expect(body).not.toHaveProperty('manualRefund');
      expect(body).not.toHaveProperty('reason');
    });

    it('returns 200 when no matching order found (orphan event)', async () => {
      const payload = makeTransparentCompletedPayload('pix_no_such_order', 'evt_orphan_1');
      const res = await app.inject({
        method: 'POST',
        url: webhookUrl,
        headers: {
          'content-type': 'application/json',
          'x-webhook-signature': 'valid-sig',
        },
        payload,
      });

      expect(res.statusCode).toBe(200);
      const body: { ok: boolean } = res.json();
      expect(body.ok).toBe(true);
    });

    it('handles expired order gracefully', async () => {
      const { user } = await createUser({ verified: true });
      const { order } = await seedEventTierOrder(user.id, { status: 'expired' });

      const payload = makeTransparentCompletedPayload(order.providerRef!, 'evt_expired_1');
      const res = await app.inject({
        method: 'POST',
        url: webhookUrl,
        headers: {
          'content-type': 'application/json',
          'x-webhook-signature': 'valid-sig',
        },
        payload,
      });

      expect(res.statusCode).toBe(200);
      const body: { ok: boolean } = res.json();
      expect(body.ok).toBe(true);
      // M2: No internal state leaked
      expect(body).not.toHaveProperty('manualRefund');
    });

    // H2: Non-pending order fallthrough — failed status should not cause 500
    it('handles failed order gracefully without 500 (H2)', async () => {
      const { user } = await createUser({ verified: true });
      const { order } = await seedEventTierOrder(user.id, { status: 'failed' });

      const payload = makeTransparentCompletedPayload(order.providerRef!, 'evt_failed_1');
      const res = await app.inject({
        method: 'POST',
        url: webhookUrl,
        headers: {
          'content-type': 'application/json',
          'x-webhook-signature': 'valid-sig',
        },
        payload,
      });

      expect(res.statusCode).toBe(200);
      const body: { ok: boolean } = res.json();
      expect(body.ok).toBe(true);

      // Event was marked processed (no infinite retry)
      const record = await prisma.paymentWebhookEvent.findUnique({
        where: { provider_eventId: { provider: 'abacatepay', eventId: 'evt_failed_1' } },
      });
      expect(record).not.toBeNull();
    });

    it('succeeds idempotently for already-paid order without creating new ticket', async () => {
      const { user } = await createUser({ verified: true });
      const { order, event } = await seedEventTierOrder(user.id, { status: 'paid' });

      await prisma.ticket.create({
        data: {
          orderId: order.id,
          userId: user.id,
          eventId: event.id,
          tierId: order.tierId,
          source: 'purchase',
          status: 'valid',
        },
      });

      const payload = makeTransparentCompletedPayload(order.providerRef!, 'evt_alreadypaid_1');
      const res = await app.inject({
        method: 'POST',
        url: webhookUrl,
        headers: {
          'content-type': 'application/json',
          'x-webhook-signature': 'valid-sig',
        },
        payload,
      });

      expect(res.statusCode).toBe(200);
      const body: { ok: boolean } = res.json();
      expect(body.ok).toBe(true);

      const tickets = await prisma.ticket.findMany({ where: { orderId: order.id } });
      expect(tickets).toHaveLength(1);
    });

    it('handles billingId in flat data format (fallback extraction)', async () => {
      const { user } = await createUser({ verified: true });
      const { order } = await seedEventTierOrder(user.id);

      const payload = JSON.stringify({
        id: 'evt_flat_format_1',
        event: 'transparent.completed',
        devMode: false,
        data: { billingId: order.providerRef, amount: 5000 },
      });

      const res = await app.inject({
        method: 'POST',
        url: webhookUrl,
        headers: {
          'content-type': 'application/json',
          'x-webhook-signature': 'valid-sig',
        },
        payload,
      });

      expect(res.statusCode).toBe(200);
      const updatedOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(updatedOrder.status).toBe('paid');
    });
  });
});
