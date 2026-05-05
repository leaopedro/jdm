import { prisma } from '@jdm/db';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { FakeStripe } from '../../src/services/stripe/fake.js';
import { createUser, makeAppWithFakeStripe, resetDatabase } from '../helpers.js';

const rawJson = (v: unknown) => Buffer.from(JSON.stringify(v));

const seedCartWithOrders = async (userId: string, opts?: { events?: number }) => {
  const eventCount = opts?.events ?? 2;
  const events: Array<{ event: { id: string; title: string }; tier: { id: string } }> = [];

  for (let i = 0; i < eventCount; i++) {
    const event = await prisma.event.create({
      data: {
        slug: `e-${Math.random().toString(36).slice(2, 8)}`,
        title: `Evento ${i + 1}`,
        description: 'desc',
        startsAt: new Date(Date.now() + 86_400_000),
        endsAt: new Date(Date.now() + 90_000_000),
        venueName: 'v',
        venueAddress: 'a',
        city: 'São Paulo',
        stateCode: 'SP',
        type: 'meeting',
        status: 'published',
        capacity: 10,
        maxTicketsPerUser: 5,
        publishedAt: new Date(),
      },
    });
    const tier = await prisma.ticketTier.create({
      data: {
        eventId: event.id,
        name: 'Geral',
        priceCents: 5000,
        quantityTotal: 10,
        quantitySold: 1,
        sortOrder: 0,
      },
    });
    events.push({ event, tier });
  }

  const cart = await prisma.cart.create({
    data: { userId, status: 'checking_out' },
  });

  const orders = await Promise.all(
    events.map(({ event, tier }) =>
      prisma.order.create({
        data: {
          userId,
          eventId: event.id,
          tierId: tier.id,
          cartId: cart.id,
          amountCents: 5000,
          quantity: 1,
          method: 'card',
          provider: 'stripe',
          status: 'pending',
          expiresAt: new Date(Date.now() + 15 * 60_000),
        },
      }),
    ),
  );

  return { cart, orders, events };
};

describe('POST /stripe/webhook (cart checkout settlement)', () => {
  let app: FastifyInstance;
  let stripe: FakeStripe;

  beforeEach(async () => {
    await resetDatabase();
    ({ app, stripe } = await makeAppWithFakeStripe());
  });

  afterEach(async () => {
    await app.close();
  });

  it('payment_intent.succeeded with cartId settles all cart orders', async () => {
    const { user } = await createUser({ verified: true });
    const { cart, orders } = await seedCartWithOrders(user.id);

    stripe.nextEvent = {
      id: 'evt_cart_pi_1',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_cart_1',
          metadata: {
            cartId: cart.id,
            userId: user.id,
            orderIds: JSON.stringify(orders.map((o) => o.id)),
          },
        },
      },
    };

    const res = await app.inject({
      method: 'POST',
      url: '/stripe/webhook',
      headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=x' },
      payload: rawJson(stripe.nextEvent),
    });

    expect(res.statusCode).toBe(200);

    const settled = await prisma.order.findMany({
      where: { cartId: cart.id },
      select: { status: true },
    });
    expect(settled.every((o) => o.status === 'paid')).toBe(true);

    const tickets = await prisma.ticket.findMany({ where: { userId: user.id } });
    expect(tickets).toHaveLength(orders.length);

    const updatedCart = await prisma.cart.findUniqueOrThrow({ where: { id: cart.id } });
    expect(updatedCart.status).toBe('converted');
  });

  it('checkout.session.completed with cartId settles all cart orders', async () => {
    const { user } = await createUser({ verified: true });
    const { cart, orders } = await seedCartWithOrders(user.id);

    stripe.nextEvent = {
      id: 'evt_cart_cs_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_cart_1',
          payment_intent: 'pi_cart_cs_1',
          payment_status: 'paid',
          metadata: {
            cartId: cart.id,
            userId: user.id,
            orderIds: JSON.stringify(orders.map((o) => o.id)),
          },
        },
      },
    };

    const res = await app.inject({
      method: 'POST',
      url: '/stripe/webhook',
      headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=x' },
      payload: rawJson(stripe.nextEvent),
    });

    expect(res.statusCode).toBe(200);

    const settled = await prisma.order.findMany({
      where: { cartId: cart.id },
      select: { status: true },
    });
    expect(settled.every((o) => o.status === 'paid')).toBe(true);

    const tickets = await prisma.ticket.findMany({ where: { userId: user.id } });
    expect(tickets).toHaveLength(orders.length);
  });

  it('is idempotent: redelivery does not duplicate tickets', async () => {
    const { user } = await createUser({ verified: true });
    const { cart, orders } = await seedCartWithOrders(user.id);

    stripe.nextEvent = {
      id: 'evt_cart_idem_1',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_cart_idem',
          metadata: {
            cartId: cart.id,
            userId: user.id,
            orderIds: JSON.stringify(orders.map((o) => o.id)),
          },
        },
      },
    };

    await app.inject({
      method: 'POST',
      url: '/stripe/webhook',
      headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=x' },
      payload: rawJson(stripe.nextEvent),
    });

    const second = await app.inject({
      method: 'POST',
      url: '/stripe/webhook',
      headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=x' },
      payload: rawJson(stripe.nextEvent),
    });

    expect(second.statusCode).toBe(200);
    const body: { deduped?: boolean } = second.json();
    expect(body.deduped).toBe(true);

    const tickets = await prisma.ticket.findMany({ where: { userId: user.id } });
    expect(tickets).toHaveLength(orders.length);
  });

  it('checkout.session.expired with cartId releases all reservations', async () => {
    const { user } = await createUser({ verified: true });
    const { cart, orders, events } = await seedCartWithOrders(user.id);

    stripe.nextEvent = {
      id: 'evt_cart_expired_1',
      type: 'checkout.session.expired',
      data: {
        object: {
          id: 'cs_cart_exp_1',
          metadata: {
            cartId: cart.id,
            orderIds: JSON.stringify(orders.map((o) => o.id)),
          },
        },
      },
    };

    const res = await app.inject({
      method: 'POST',
      url: '/stripe/webhook',
      headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=x' },
      payload: rawJson(stripe.nextEvent),
    });

    expect(res.statusCode).toBe(200);

    const failedOrders = await prisma.order.findMany({
      where: { cartId: cart.id },
      select: { status: true },
    });
    expect(failedOrders.every((o) => o.status === 'failed')).toBe(true);

    for (const { tier } of events) {
      const updated = await prisma.ticketTier.findUniqueOrThrow({ where: { id: tier.id } });
      expect(updated.quantitySold).toBe(0);
    }

    const updatedCart = await prisma.cart.findUniqueOrThrow({ where: { id: cart.id } });
    expect(updatedCart.status).toBe('open');
  });

  it('payment_intent.payment_failed with cartId releases reservations', async () => {
    const { user } = await createUser({ verified: true });
    const { cart, orders, events } = await seedCartWithOrders(user.id);

    stripe.nextEvent = {
      id: 'evt_cart_pifail_1',
      type: 'payment_intent.payment_failed',
      data: {
        object: {
          id: 'pi_cart_fail_1',
          metadata: {
            cartId: cart.id,
            orderIds: JSON.stringify(orders.map((o) => o.id)),
          },
        },
      },
    };

    const res = await app.inject({
      method: 'POST',
      url: '/stripe/webhook',
      headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=x' },
      payload: rawJson(stripe.nextEvent),
    });

    expect(res.statusCode).toBe(200);

    const failedOrders = await prisma.order.findMany({
      where: { cartId: cart.id },
      select: { status: true },
    });
    expect(failedOrders.every((o) => o.status === 'failed')).toBe(true);

    for (const { tier } of events) {
      const updated = await prisma.ticketTier.findUniqueOrThrow({ where: { id: tier.id } });
      expect(updated.quantitySold).toBe(0);
    }

    const updatedCart = await prisma.cart.findUniqueOrThrow({ where: { id: cart.id } });
    expect(updatedCart.status).toBe('open');
  });
});
