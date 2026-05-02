import { prisma } from '@jdm/db';
import { createOrderResponseSchema } from '@jdm/shared/orders';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

const errorResponseSchema = z.object({ error: z.string(), message: z.string().optional() });

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

describe('POST /orders', () => {
  let app: FastifyInstance;
  let stripe: FakeStripe;

  beforeEach(async () => {
    await resetDatabase();
    ({ app, stripe } = await makeAppWithFakeStripe());
  });

  afterEach(async () => {
    await app.close();
  });

  it('creates a pending order, bumps quantitySold, and returns clientSecret', async () => {
    const { user } = await createUser({ verified: true });
    const { event, tier } = await seedPublishedEvent();

    const res = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { authorization: bearer(env, user.id) },
      payload: { eventId: event.id, tierId: tier.id, method: 'card' },
    });

    expect(res.statusCode).toBe(201);
    const body = createOrderResponseSchema.parse(res.json());
    expect(body.status).toBe('pending');
    expect(body.amountCents).toBe(5000);
    expect(body.clientSecret).toBe('pi_test_1_secret_abc');

    const order = await prisma.order.findUniqueOrThrow({ where: { id: body.orderId } });
    expect(order.status).toBe('pending');
    expect(order.providerRef).toBe('pi_test_1');

    const reloaded = await prisma.ticketTier.findUniqueOrThrow({ where: { id: tier.id } });
    expect(reloaded.quantitySold).toBe(1);

    expect(stripe.calls).toHaveLength(1);
    expect(stripe.calls[0]!.kind).toBe('createPaymentIntent');
  });

  it('returns 409 when the tier is sold out', async () => {
    const { user } = await createUser({ verified: true });
    const { event, tier } = await seedPublishedEvent(1);
    await prisma.ticketTier.update({
      where: { id: tier.id },
      data: { quantitySold: 1 },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { authorization: bearer(env, user.id) },
      payload: { eventId: event.id, tierId: tier.id, method: 'card' },
    });

    expect(res.statusCode).toBe(409);
    const body = errorResponseSchema.parse(res.json());
    expect(body.error).toBe('Conflict');
    expect(stripe.calls).toHaveLength(0);
  });

  it('returns 409 when the user already has a valid ticket for the event', async () => {
    const { user } = await createUser({ verified: true });
    const { event, tier } = await seedPublishedEvent();
    await prisma.ticket.create({
      data: { userId: user.id, eventId: event.id, tierId: tier.id, source: 'comp' },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { authorization: bearer(env, user.id) },
      payload: { eventId: event.id, tierId: tier.id, method: 'card' },
    });

    expect(res.statusCode).toBe(409);
    expect(stripe.calls).toHaveLength(0);
  });

  it('returns 404 when the event is not published', async () => {
    const { user } = await createUser({ verified: true });
    const { event, tier } = await seedPublishedEvent();
    await prisma.event.update({ where: { id: event.id }, data: { status: 'draft' } });

    const res = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { authorization: bearer(env, user.id) },
      payload: { eventId: event.id, tierId: tier.id, method: 'card' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 when the tier does not belong to the event', async () => {
    const { user } = await createUser({ verified: true });
    const { event } = await seedPublishedEvent();
    const otherEvent = await seedPublishedEvent();

    const res = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { authorization: bearer(env, user.id) },
      payload: { eventId: event.id, tierId: otherEvent.tier.id, method: 'card' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects unauthenticated requests', async () => {
    const { event, tier } = await seedPublishedEvent();
    const res = await app.inject({
      method: 'POST',
      url: '/orders',
      payload: { eventId: event.id, tierId: tier.id, method: 'card' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects Pix method with 400 (Pix ships in F4b)', async () => {
    const { user } = await createUser({ verified: true });
    const { event, tier } = await seedPublishedEvent();
    const res = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { authorization: bearer(env, user.id) },
      payload: { eventId: event.id, tierId: tier.id, method: 'pix' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('sweeps expired pending orders and reclaims capacity before reserving', async () => {
    const { user } = await createUser({ verified: true });
    const { user: user2 } = await createUser({ email: 'user2@jdm.test', verified: true });
    // capacity=1 so the expired order holds the only slot
    const { event, tier } = await seedPublishedEvent(1);

    // Seed an expired pending order that occupies the sole slot
    await prisma.order.create({
      data: {
        userId: user.id,
        eventId: event.id,
        tierId: tier.id,
        amountCents: 5000,
        method: 'card',
        provider: 'stripe',
        providerRef: 'pi_abandoned',
        status: 'pending',
        expiresAt: new Date(Date.now() - 1000), // expired 1s ago
      },
    });
    await prisma.ticketTier.update({
      where: { id: tier.id },
      data: { quantitySold: 1 },
    });

    // user2 should succeed: expired order is swept, slot freed, then reserved for user2
    const res = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { authorization: bearer(env, user2.id) },
      payload: { eventId: event.id, tierId: tier.id, method: 'card' },
    });

    expect(res.statusCode).toBe(201);

    const abandoned = await prisma.order.findFirst({
      where: { userId: user.id, eventId: event.id },
    });
    expect(abandoned?.status).toBe('expired');

    // after sweep (-1) and new reservation (+1), quantitySold = 1
    const reloadedTier = await prisma.ticketTier.findUniqueOrThrow({ where: { id: tier.id } });
    expect(reloadedTier.quantitySold).toBe(1);

    // Stripe cancel called for the swept PI
    const cancelCalls = stripe.calls.filter((c) => c.kind === 'cancelPaymentIntent');
    expect(cancelCalls).toHaveLength(1);
    expect(cancelCalls[0]?.payload).toMatchObject({ paymentIntentId: 'pi_abandoned' });
  });
});
