import { prisma } from '@jdm/db';
import { beginCheckoutResponseSchema } from '@jdm/shared/cart';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { loadEnv } from '../../src/env.js';
import type { FakeAbacatePay } from '../../src/services/abacatepay/fake.js';
import { AbacatePayUpstreamError } from '../../src/services/abacatepay/index.js';
import type { FakeStripe } from '../../src/services/stripe/fake.js';
import {
  bearer,
  createUser,
  makeAppWithFakes,
  makeAppWithFakeStripe,
  resetDatabase,
} from '../helpers.js';

const env = loadEnv();
const errorSchema = z.object({ error: z.string(), message: z.string().optional() });

const seedPublishedEvent = async (opts?: {
  quantityTotal?: number;
  priceCents?: number;
  maxTicketsPerUser?: number;
}) => {
  const event = await prisma.event.create({
    data: {
      slug: `e-${Math.random().toString(36).slice(2, 8)}`,
      title: 'Evento Teste',
      description: 'Descrição',
      startsAt: new Date(Date.now() + 86_400_000),
      endsAt: new Date(Date.now() + 90_000_000),
      type: 'meeting',
      status: 'published',
      publishedAt: new Date(),
      capacity: 100,
      maxTicketsPerUser: opts?.maxTicketsPerUser ?? 5,
    },
  });
  const tier = await prisma.ticketTier.create({
    data: {
      eventId: event.id,
      name: 'Geral',
      priceCents: opts?.priceCents ?? 5000,
      currency: 'BRL',
      quantityTotal: opts?.quantityTotal ?? 50,
      quantitySold: 0,
    },
  });
  return { event, tier };
};

const seedExtra = async (
  eventId: string,
  opts?: { priceCents?: number; quantityTotal?: number | null; active?: boolean },
) => {
  return prisma.ticketExtra.create({
    data: {
      eventId,
      name: `Extra ${Math.random().toString(36).slice(2, 6)}`,
      priceCents: opts?.priceCents ?? 1000,
      currency: 'BRL',
      quantityTotal: opts?.quantityTotal ?? 100,
      quantitySold: 0,
      active: opts?.active ?? true,
      sortOrder: 0,
    },
  });
};

const addCartItem = async (
  app: FastifyInstance,
  token: string,
  item: {
    eventId: string;
    tierId: string;
    quantity?: number;
    tickets?: Array<{ carId?: string; licensePlate?: string; extras?: string[] }>;
    kind?: 'ticket' | 'extras_only';
  },
) => {
  const tickets = item.tickets ?? [{ extras: [] }];
  const res = await app.inject({
    method: 'POST',
    url: '/cart/items',
    headers: { authorization: token },
    payload: {
      item: {
        eventId: item.eventId,
        tierId: item.tierId,
        source: 'purchase',
        kind: item.kind ?? 'ticket',
        quantity: item.quantity ?? 1,
        tickets,
      },
    },
  });
  expect(res.statusCode).toBe(200);
  const json: unknown = res.json();
  return json;
};

describe('POST /cart/checkout', () => {
  let app: FastifyInstance;
  let stripe: FakeStripe;

  beforeEach(async () => {
    await resetDatabase();
    ({ app, stripe } = await makeAppWithFakeStripe());
  });

  afterEach(async () => {
    await app.close();
  });

  it('creates orders from cart items and returns checkout URL', async () => {
    const { user } = await createUser({ verified: true });
    const token = bearer(env, user.id);
    const { event, tier } = await seedPublishedEvent();

    await addCartItem(app, token, { eventId: event.id, tierId: tier.id });

    const res = await app.inject({
      method: 'POST',
      url: '/cart/checkout',
      headers: { authorization: token },
      payload: {
        paymentMethod: 'card',
        successUrl: 'https://app.jdm.com/success',
        cancelUrl: 'https://app.jdm.com/cancel',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = beginCheckoutResponseSchema.parse(res.json());
    expect(body.checkoutUrl).toBe('https://checkout.stripe.com/cs_test_1');
    expect(body.orderIds).toHaveLength(1);
    expect(body.provider).toBe('stripe');
    expect(body.status).toBe('pending');

    const order = await prisma.order.findFirst({ where: { id: body.orderIds[0]! } });
    expect(order).not.toBeNull();
    expect(order!.cartId).toBe(body.checkoutId);
    expect(order!.status).toBe('pending');
    expect(order!.amountCents).toBe(5000);
  });

  it('creates one order per cart item for multiple events', async () => {
    const { user } = await createUser({ verified: true });
    const token = bearer(env, user.id);
    const { event: ev1, tier: tier1 } = await seedPublishedEvent({ priceCents: 3000 });
    const { event: ev2, tier: tier2 } = await seedPublishedEvent({ priceCents: 7000 });

    await addCartItem(app, token, { eventId: ev1.id, tierId: tier1.id });
    await addCartItem(app, token, { eventId: ev2.id, tierId: tier2.id });

    const res = await app.inject({
      method: 'POST',
      url: '/cart/checkout',
      headers: { authorization: token },
      payload: { paymentMethod: 'card' },
    });

    expect(res.statusCode).toBe(201);
    const body = beginCheckoutResponseSchema.parse(res.json());
    expect(body.orderIds).toHaveLength(2);

    const orders = await prisma.order.findMany({
      where: { id: { in: body.orderIds } },
      orderBy: { amountCents: 'asc' },
    });
    expect(orders[0]!.amountCents).toBe(3000);
    expect(orders[1]!.amountCents).toBe(7000);
    expect(orders[0]!.cartId).toBe(body.checkoutId);
    expect(orders[1]!.cartId).toBe(body.checkoutId);
  });

  it('includes extras in order amount', async () => {
    const { user } = await createUser({ verified: true });
    const token = bearer(env, user.id);
    const { event, tier } = await seedPublishedEvent({ priceCents: 5000 });
    const extra = await seedExtra(event.id, { priceCents: 2000 });

    await addCartItem(app, token, {
      eventId: event.id,
      tierId: tier.id,
      tickets: [{ extras: [extra.id] }],
    });

    const res = await app.inject({
      method: 'POST',
      url: '/cart/checkout',
      headers: { authorization: token },
      payload: { paymentMethod: 'card' },
    });

    expect(res.statusCode).toBe(201);
    const body = beginCheckoutResponseSchema.parse(res.json());
    const order = await prisma.order.findUniqueOrThrow({ where: { id: body.orderIds[0]! } });
    expect(order.amountCents).toBe(7000);
  });

  it('transitions cart status to checking_out', async () => {
    const { user } = await createUser({ verified: true });
    const token = bearer(env, user.id);
    const { event, tier } = await seedPublishedEvent();

    await addCartItem(app, token, { eventId: event.id, tierId: tier.id });

    await app.inject({
      method: 'POST',
      url: '/cart/checkout',
      headers: { authorization: token },
      payload: { paymentMethod: 'card' },
    });

    const cart = await prisma.cart.findFirst({ where: { userId: user.id } });
    expect(cart!.status).toBe('checking_out');
  });

  it('reserves tier stock on checkout', async () => {
    const { user } = await createUser({ verified: true });
    const token = bearer(env, user.id);
    const { event, tier } = await seedPublishedEvent({ quantityTotal: 5 });

    await addCartItem(app, token, { eventId: event.id, tierId: tier.id });

    await app.inject({
      method: 'POST',
      url: '/cart/checkout',
      headers: { authorization: token },
      payload: { paymentMethod: 'card' },
    });

    const updated = await prisma.ticketTier.findUniqueOrThrow({ where: { id: tier.id } });
    expect(updated.quantitySold).toBe(1);
  });

  it('reserves extras stock on checkout', async () => {
    const { user } = await createUser({ verified: true });
    const token = bearer(env, user.id);
    const { event, tier } = await seedPublishedEvent();
    const extra = await seedExtra(event.id, { quantityTotal: 10 });

    await addCartItem(app, token, {
      eventId: event.id,
      tierId: tier.id,
      tickets: [{ extras: [extra.id] }],
    });

    await app.inject({
      method: 'POST',
      url: '/cart/checkout',
      headers: { authorization: token },
      payload: { paymentMethod: 'card' },
    });

    const updated = await prisma.ticketExtra.findUniqueOrThrow({ where: { id: extra.id } });
    expect(updated.quantitySold).toBe(1);
  });

  it('passes cartId in Stripe session metadata', async () => {
    const { user } = await createUser({ verified: true });
    const token = bearer(env, user.id);
    const { event, tier } = await seedPublishedEvent();

    await addCartItem(app, token, { eventId: event.id, tierId: tier.id });

    const res = await app.inject({
      method: 'POST',
      url: '/cart/checkout',
      headers: { authorization: token },
      payload: {
        paymentMethod: 'card',
        successUrl: 'https://app.jdm.com/ok',
        cancelUrl: 'https://app.jdm.com/x',
      },
    });

    expect(res.statusCode).toBe(201);
    const sessionCall = stripe.calls.find((c) => c.kind === 'createCheckoutSession');
    expect(sessionCall).toBeDefined();
    const payload = sessionCall!.payload as { metadata: Record<string, string> };
    expect(payload.metadata.cartId).toBeDefined();
    expect(payload.metadata.userId).toBe(user.id);
  });

  it('rejects checkout on empty cart', async () => {
    const { user } = await createUser({ verified: true });
    const token = bearer(env, user.id);

    const res = await app.inject({
      method: 'POST',
      url: '/cart/checkout',
      headers: { authorization: token },
      payload: { paymentMethod: 'card' },
    });

    expect(res.statusCode).toBe(422);
    const body = errorSchema.parse(res.json());
    expect(body.error).toBe('UnprocessableEntity');
  });

  it('rejects checkout when tier is sold out', async () => {
    const { user } = await createUser({ verified: true });
    const token = bearer(env, user.id);
    const { event, tier } = await seedPublishedEvent({ quantityTotal: 1 });

    await addCartItem(app, token, { eventId: event.id, tierId: tier.id });

    await prisma.ticketTier.update({
      where: { id: tier.id },
      data: { quantitySold: 1 },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/cart/checkout',
      headers: { authorization: token },
      payload: { paymentMethod: 'card' },
    });

    expect(res.statusCode).toBe(409);
    const body = errorSchema.parse(res.json());
    expect(body.error).toBe('Conflict');
  });

  it('rejects unauthenticated requests', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/cart/checkout',
      payload: { paymentMethod: 'card' },
    });

    expect(res.statusCode).toBe(401);
  });

  it('rejects if cart is already checking out', async () => {
    const { user } = await createUser({ verified: true });
    const token = bearer(env, user.id);
    const { event, tier } = await seedPublishedEvent();

    await addCartItem(app, token, { eventId: event.id, tierId: tier.id });

    await prisma.cart.updateMany({
      where: { userId: user.id, status: 'open' },
      data: { status: 'checking_out' },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/cart/checkout',
      headers: { authorization: token },
      payload: { paymentMethod: 'card' },
    });

    expect(res.statusCode).toBe(409);
  });

  it('rolls back reservations if Stripe session creation fails', async () => {
    const { user } = await createUser({ verified: true });
    const token = bearer(env, user.id);
    const { event, tier } = await seedPublishedEvent({ quantityTotal: 5 });
    const extra = await seedExtra(event.id, { quantityTotal: 10 });

    await addCartItem(app, token, {
      eventId: event.id,
      tierId: tier.id,
      tickets: [{ extras: [extra.id] }],
    });

    stripe.createCheckoutSession = () => {
      throw new Error('Stripe unavailable');
    };

    const res = await app.inject({
      method: 'POST',
      url: '/cart/checkout',
      headers: { authorization: token },
      payload: { paymentMethod: 'card' },
    });

    expect(res.statusCode).toBe(500);
    const tierAfter = await prisma.ticketTier.findUniqueOrThrow({ where: { id: tier.id } });
    expect(tierAfter.quantitySold).toBe(0);
    const extraAfter = await prisma.ticketExtra.findUniqueOrThrow({ where: { id: extra.id } });
    expect(extraAfter.quantitySold).toBe(0);

    const cart = await prisma.cart.findFirst({ where: { userId: user.id } });
    expect(cart!.status).toBe('open');
  });

  it('rejects checkout when quantity exceeds remaining capacity (no oversell)', async () => {
    const { user } = await createUser({ verified: true });
    const token = bearer(env, user.id);
    const { event, tier } = await seedPublishedEvent({ quantityTotal: 10 });

    await addCartItem(app, token, {
      eventId: event.id,
      tierId: tier.id,
      quantity: 2,
      tickets: [{ extras: [] }, { extras: [] }],
    });

    await prisma.ticketTier.update({
      where: { id: tier.id },
      data: { quantitySold: 9 },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/cart/checkout',
      headers: { authorization: token },
      payload: { paymentMethod: 'card' },
    });

    expect(res.statusCode).toBe(409);
    const body = errorSchema.parse(res.json());
    expect(body.error).toBe('Conflict');

    const tierAfter = await prisma.ticketTier.findUniqueOrThrow({ where: { id: tier.id } });
    expect(tierAfter.quantitySold).toBe(9);
  });

  it('concurrent checkout requests: only one succeeds (no double reservation)', async () => {
    const { user } = await createUser({ verified: true });
    const token = bearer(env, user.id);
    const { event, tier } = await seedPublishedEvent();

    await addCartItem(app, token, { eventId: event.id, tierId: tier.id });

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        app.inject({
          method: 'POST',
          url: '/cart/checkout',
          headers: { authorization: token },
          payload: { paymentMethod: 'card' },
        }),
      ),
    );

    const successes = results.filter((r) => r.statusCode === 201);
    const conflicts = results.filter((r) => r.statusCode === 409);

    expect(successes).toHaveLength(1);
    expect(conflicts.length).toBeGreaterThanOrEqual(1);

    const tierAfter = await prisma.ticketTier.findUniqueOrThrow({ where: { id: tier.id } });
    expect(tierAfter.quantitySold).toBe(1);
  });
});

describe('POST /cart/checkout — pix', () => {
  let app: FastifyInstance;
  let abacatepay: FakeAbacatePay;

  beforeEach(async () => {
    await resetDatabase();
    ({ app, abacatepay } = await makeAppWithFakes());
  });

  afterEach(async () => {
    await app.close();
  });

  it('creates pix billing for cart and returns brCode + abacatepay provider', async () => {
    const { user } = await createUser({ verified: true });
    const token = bearer(env, user.id);
    const { event: ev1, tier: tier1 } = await seedPublishedEvent({ priceCents: 4000 });
    const { event: ev2, tier: tier2 } = await seedPublishedEvent({ priceCents: 6000 });

    await addCartItem(app, token, { eventId: ev1.id, tierId: tier1.id });
    await addCartItem(app, token, { eventId: ev2.id, tierId: tier2.id });

    abacatepay.nextBilling = {
      id: 'pix_cart_test',
      brCode: '00020126...cartpix',
      amount: 10000,
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      status: 'PENDING',
    };

    const res = await app.inject({
      method: 'POST',
      url: '/cart/checkout',
      headers: { authorization: token },
      payload: { paymentMethod: 'pix' },
    });

    expect(res.statusCode).toBe(201);
    const body = beginCheckoutResponseSchema.parse(res.json());
    expect(body.provider).toBe('abacatepay');
    expect(body.brCode).toBe('00020126...cartpix');
    expect(body.checkoutUrl).toBeNull();
    expect(body.clientSecret).toBeNull();
    expect(body.providerRef).toBe('pix_cart_test');
    expect(body.orderIds).toHaveLength(2);

    const billingCall = abacatepay.calls.find((c) => c.method === 'createPixBilling');
    expect(billingCall).toBeDefined();
    const input = billingCall!.args[0] as { amountCents: number; metadata: Record<string, string> };
    expect(input.amountCents).toBe(10000);
    expect(input.metadata.cartId).toBe(body.checkoutId);
    expect(input.metadata.userId).toBe(user.id);

    const orders = await prisma.order.findMany({ where: { id: { in: body.orderIds } } });
    expect(orders).toHaveLength(2);
    for (const order of orders) {
      expect(order.method).toBe('pix');
      expect(order.provider).toBe('abacatepay');
      expect(order.status).toBe('pending');
      expect(order.cartId).toBe(body.checkoutId);
    }
    const withRef = orders.filter((o) => o.providerRef === 'pix_cart_test');
    expect(withRef).toHaveLength(1);
  });

  it('returns 503 when abacatepay is not configured', async () => {
    await app.close();
    ({ app } = await makeAppWithFakeStripe());

    const { user } = await createUser({ verified: true });
    const token = bearer(env, user.id);
    const { event, tier } = await seedPublishedEvent();
    await addCartItem(app, token, { eventId: event.id, tierId: tier.id });

    const res = await app.inject({
      method: 'POST',
      url: '/cart/checkout',
      headers: { authorization: token },
      payload: { paymentMethod: 'pix' },
    });

    expect(res.statusCode).toBe(503);
    const body = errorSchema.parse(res.json());
    expect(body.error).toBe('ServiceUnavailable');
  });

  it('rolls back reservations and returns 502 when abacatepay rejects (4xx)', async () => {
    const { user } = await createUser({ verified: true });
    const token = bearer(env, user.id);
    const { event, tier } = await seedPublishedEvent({ quantityTotal: 5 });
    const extra = await seedExtra(event.id, { quantityTotal: 10 });

    await addCartItem(app, token, {
      eventId: event.id,
      tierId: tier.id,
      tickets: [{ extras: [extra.id] }],
    });

    abacatepay.nextBillingError = new AbacatePayUpstreamError(422, 'invalid', 'amount invalid');

    const res = await app.inject({
      method: 'POST',
      url: '/cart/checkout',
      headers: { authorization: token },
      payload: { paymentMethod: 'pix' },
    });

    expect(res.statusCode).toBe(502);
    const body = errorSchema.parse(res.json());
    expect(body.error).toBe('BadGateway');

    const tierAfter = await prisma.ticketTier.findUniqueOrThrow({ where: { id: tier.id } });
    expect(tierAfter.quantitySold).toBe(0);
    const extraAfter = await prisma.ticketExtra.findUniqueOrThrow({ where: { id: extra.id } });
    expect(extraAfter.quantitySold).toBe(0);
    const cart = await prisma.cart.findFirst({ where: { userId: user.id } });
    expect(cart!.status).toBe('open');
  });
});
