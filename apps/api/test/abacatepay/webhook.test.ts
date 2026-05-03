import { prisma } from '@jdm/db';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/env.js';
import { buildFakeAbacatePay, type FakeAbacatePay } from '../../src/services/abacatepay/fake.js';
import { buildFakeStripe } from '../../src/services/stripe/fake.js';
import { resetDatabase } from '../helpers.js';

const env = loadEnv();

const makePayload = (overrides: Partial<{ id: string; event: string; devMode: boolean }> = {}) =>
  JSON.stringify({
    id: overrides.id ?? `evt_${Date.now()}`,
    event: overrides.event ?? 'transparent.completed',
    devMode: overrides.devMode ?? true,
    data: { billingId: 'pix_123', amount: 5000 },
  });

describe('POST /abacatepay/webhook', () => {
  let app: FastifyInstance;
  let abacatepay: FakeAbacatePay;

  beforeEach(async () => {
    await resetDatabase();
    abacatepay = buildFakeAbacatePay();
    const stripe = buildFakeStripe();
    app = await buildApp(env, { stripe, abacatepay });
  });

  afterEach(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('rejects missing signature with 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/abacatepay/webhook',
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
      url: '/abacatepay/webhook',
      headers: {
        'content-type': 'application/json',
        'x-webhook-signature': 'bad-sig',
      },
      payload: makePayload(),
    });
    expect(res.statusCode).toBe(401);
  });

  it('accepts valid signature and returns 200', async () => {
    const payload = makePayload({ id: 'evt_valid_1' });
    const res = await app.inject({
      method: 'POST',
      url: '/abacatepay/webhook',
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

  it('deduplicates: second delivery of same event returns deduped=true', async () => {
    const payload = makePayload({ id: 'evt_dedup_1' });
    const inject = () =>
      app.inject({
        method: 'POST',
        url: '/abacatepay/webhook',
        headers: {
          'content-type': 'application/json',
          'x-webhook-signature': 'valid-sig',
        },
        payload,
      });

    const first = await inject();
    expect(first.statusCode).toBe(200);
    const firstBody: { deduped?: boolean } = first.json();
    expect(firstBody.deduped).toBeUndefined();

    const second = await inject();
    expect(second.statusCode).toBe(200);
    const secondBody: { deduped?: boolean } = second.json();
    expect(secondBody.deduped).toBe(true);
  });

  it('stores webhook event in PaymentWebhookEvent table', async () => {
    const eventId = `evt_store_${Date.now()}`;
    const payload = makePayload({ id: eventId });
    await app.inject({
      method: 'POST',
      url: '/abacatepay/webhook',
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
      url: '/abacatepay/webhook',
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
      url: '/abacatepay/webhook',
      headers: {
        'content-type': 'application/json',
        'x-webhook-signature': 'valid-sig',
      },
      payload: JSON.stringify({ event: 'transparent.completed', data: {} }),
    });
    expect(res.statusCode).toBe(400);
  });
});
