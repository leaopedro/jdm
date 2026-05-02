import { prisma } from '@jdm/db';
import { getOrderResponseSchema } from '@jdm/shared/orders';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadEnv } from '../../src/env.js';
import type { FakeStripe } from '../../src/services/stripe/fake.js';
import { bearer, createUser, makeAppWithFakeStripe, resetDatabase } from '../helpers.js';

const env = loadEnv();

const seedPublishedEvent = async (quantityTotal = 10) => {
  const event = await prisma.event.create({
    data: {
      slug: `e-${Math.random().toString(36).slice(2, 8)}`,
      title: 'Evento',
      description: 'desc',
      startsAt: new Date(Date.now() + 86400_000),
      endsAt: new Date(Date.now() + 90000_000),
      venueName: 'v',
      venueAddress: 'a',
      city: 'São Paulo',
      stateCode: 'SP',
      type: 'meeting',
      status: 'published',
      capacity: quantityTotal,
      publishedAt: new Date(),
    },
  });
  const tier = await prisma.ticketTier.create({
    data: {
      eventId: event.id,
      name: 'Geral',
      priceCents: 5000,
      quantityTotal,
      sortOrder: 0,
    },
  });
  return { event, tier };
};

describe('GET /orders/:id', () => {
  let app: FastifyInstance;
  let stripe: FakeStripe;

  beforeEach(async () => {
    await resetDatabase();
    ({ app, stripe } = await makeAppWithFakeStripe());
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 200 with a live pending order unchanged', async () => {
    const { user } = await createUser({ verified: true });
    const { event, tier } = await seedPublishedEvent();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const order = await prisma.order.create({
      data: {
        userId: user.id,
        eventId: event.id,
        tierId: tier.id,
        amountCents: 5000,
        method: 'card',
        provider: 'stripe',
        providerRef: 'pi_live',
        status: 'pending',
        expiresAt,
      },
    });
    await prisma.ticketTier.update({ where: { id: tier.id }, data: { quantitySold: 1 } });

    const res = await app.inject({
      method: 'GET',
      url: `/orders/${order.id}`,
      headers: { authorization: bearer(env, user.id) },
    });

    expect(res.statusCode).toBe(200);
    const body = getOrderResponseSchema.parse(res.json());
    expect(body.status).toBe('pending');
    expect(body.orderId).toBe(order.id);
    expect(body.amountCents).toBe(5000);
    expect(body.currency).toBe('BRL');

    // no expiry side-effect
    const reloadedTier = await prisma.ticketTier.findUniqueOrThrow({ where: { id: tier.id } });
    expect(reloadedTier.quantitySold).toBe(1);
    expect(stripe.calls.filter((c) => c.kind === 'cancelPaymentIntent')).toHaveLength(0);
  });

  it('lazily expires an overdue pending order and releases capacity', async () => {
    const { user } = await createUser({ verified: true });
    const { event, tier } = await seedPublishedEvent(1);
    const order = await prisma.order.create({
      data: {
        userId: user.id,
        eventId: event.id,
        tierId: tier.id,
        amountCents: 5000,
        method: 'card',
        provider: 'stripe',
        providerRef: 'pi_stale',
        status: 'pending',
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    await prisma.ticketTier.update({ where: { id: tier.id }, data: { quantitySold: 1 } });

    const res = await app.inject({
      method: 'GET',
      url: `/orders/${order.id}`,
      headers: { authorization: bearer(env, user.id) },
    });

    expect(res.statusCode).toBe(200);
    const body = getOrderResponseSchema.parse(res.json());
    expect(body.status).toBe('expired');

    const reloadedTier = await prisma.ticketTier.findUniqueOrThrow({ where: { id: tier.id } });
    expect(reloadedTier.quantitySold).toBe(0);

    const cancelCalls = stripe.calls.filter((c) => c.kind === 'cancelPaymentIntent');
    expect(cancelCalls).toHaveLength(1);
    expect(cancelCalls[0]?.payload).toMatchObject({ paymentIntentId: 'pi_stale' });
  });

  it('returns 404 when order does not exist', async () => {
    const { user } = await createUser({ verified: true });
    const res = await app.inject({
      method: 'GET',
      url: '/orders/nonexistent-id',
      headers: { authorization: bearer(env, user.id) },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 when the order belongs to a different user', async () => {
    const { user } = await createUser({ verified: true });
    const { user: other } = await createUser({ email: 'other@jdm.test', verified: true });
    const { event, tier } = await seedPublishedEvent();
    const order = await prisma.order.create({
      data: {
        userId: other.id,
        eventId: event.id,
        tierId: tier.id,
        amountCents: 5000,
        method: 'card',
        provider: 'stripe',
        status: 'pending',
        expiresAt: new Date(Date.now() + 900_000),
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/orders/${order.id}`,
      headers: { authorization: bearer(env, user.id) },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 401 when unauthenticated', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/orders/some-id',
    });
    expect(res.statusCode).toBe(401);
  });
});
