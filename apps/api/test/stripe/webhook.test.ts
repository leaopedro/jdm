import { prisma } from '@jdm/db';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { FakeStripe } from '../../src/services/stripe/fake.js';
import { createUser, makeAppWithFakeStripe, resetDatabase } from '../helpers.js';

const rawJson = (v: unknown) => Buffer.from(JSON.stringify(v));

const seedEventTierOrder = async (userId: string, opts?: { quantity?: number }) => {
  const quantity = opts?.quantity ?? 1;
  const event = await prisma.event.create({
    data: {
      slug: `e-${Math.random().toString(36).slice(2, 8)}`,
      title: 'Evento',
      description: 'desc',
      startsAt: new Date(Date.now() + 86400_000),
      endsAt: new Date(Date.now() + 90000_000),
      venueName: 'v',
      venueAddress: 'a',
      city: 'Sao Paulo',
      stateCode: 'SP',
      type: 'meeting',
      status: 'published',
      capacity: 5,
      publishedAt: new Date(),
    },
  });
  const tier = await prisma.ticketTier.create({
    data: {
      eventId: event.id,
      name: 'Geral',
      priceCents: 5000,
      quantityTotal: 5,
      quantitySold: quantity,
      sortOrder: 0,
    },
  });
  const order = await prisma.order.create({
    data: {
      userId,
      eventId: event.id,
      tierId: tier.id,
      amountCents: 5000 * quantity,
      quantity,
      method: 'card',
      provider: 'stripe',
      providerRef: 'pi_test_abc',
      status: 'pending',
    },
  });
  return { event, tier, order };
};

describe('POST /stripe/webhook', () => {
  let app: FastifyInstance;
  let stripe: FakeStripe;

  beforeEach(async () => {
    await resetDatabase();
    ({ app, stripe } = await makeAppWithFakeStripe());
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 400 when the stripe-signature header is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/stripe/webhook',
      headers: { 'content-type': 'application/json' },
      payload: rawJson({ id: 'evt_1' }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when signature verification fails', async () => {
    stripe.nextSignatureValid = false;
    const res = await app.inject({
      method: 'POST',
      url: '/stripe/webhook',
      headers: { 'content-type': 'application/json', 'stripe-signature': 'bad' },
      payload: rawJson({ id: 'evt_1' }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('handles payment_intent.succeeded: marks order paid and issues ticket', async () => {
    const { user } = await createUser({ verified: true });
    const { order } = await seedEventTierOrder(user.id);

    stripe.nextEvent = {
      id: 'evt_success_1',
      type: 'payment_intent.succeeded',
      data: { object: { id: order.providerRef, metadata: { orderId: order.id } } },
    };

    const res = await app.inject({
      method: 'POST',
      url: '/stripe/webhook',
      headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=x' },
      payload: rawJson(stripe.nextEvent),
    });
    expect(res.statusCode).toBe(200);

    const reloaded = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(reloaded.status).toBe('paid');

    const ticket = await prisma.ticket.findFirst({ where: { orderId: order.id } });
    expect(ticket).not.toBeNull();
  });

  it('issues N tickets + per-ticket extras/cars atomically from webhook metadata', async () => {
    const { user } = await createUser({ verified: true });
    const { event, tier: _tier, order } = await seedEventTierOrder(user.id, { quantity: 3 });
    const [car1, car2] = await Promise.all([
      prisma.car.create({ data: { userId: user.id, make: 'Honda', model: 'Civic', year: 2020 } }),
      prisma.car.create({ data: { userId: user.id, make: 'Toyota', model: 'Supra', year: 1994 } }),
    ]);
    const extra1 = await prisma.ticketExtra.create({
      data: { eventId: event.id, name: 'Camiseta', priceCents: 2000 },
    });
    const extra2 = await prisma.ticketExtra.create({
      data: { eventId: event.id, name: 'Adesivo', priceCents: 1000 },
    });
    await prisma.orderExtra.createMany({
      data: [
        { orderId: order.id, extraId: extra1.id, quantity: 2 },
        { orderId: order.id, extraId: extra2.id, quantity: 1 },
      ],
    });

    stripe.nextEvent = {
      id: 'evt_success_multi_1',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: order.providerRef,
          metadata: {
            orderId: order.id,
            tickets: JSON.stringify([
              { c: car1.id, p: 'ABC-1234', e: [extra1.id, extra2.id] },
              { c: car2.id, p: 'DEF-5678', e: [] },
              { e: [extra1.id] },
            ]),
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

    const tickets = await prisma.ticket.findMany({
      where: { orderId: order.id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    expect(tickets).toHaveLength(3);
    expect(tickets[0]?.carId).toBe(car1.id);
    expect(tickets[0]?.licensePlate).toBe('ABC-1234');
    expect(tickets[1]?.carId).toBe(car2.id);
    expect(tickets[1]?.licensePlate).toBe('DEF-5678');

    const itemsByTicket = await Promise.all(
      tickets.map((t) =>
        prisma.ticketExtraItem.findMany({
          where: { ticketId: t.id },
          orderBy: { extraId: 'asc' },
        }),
      ),
    );
    expect(itemsByTicket[0]).toHaveLength(2);
    expect(itemsByTicket[1]).toHaveLength(0);
    expect(itemsByTicket[2]).toHaveLength(1);
  });

  it('is idempotent: redelivery of the same event does not re-issue tickets', async () => {
    const { user } = await createUser({ verified: true });
    const { order } = await seedEventTierOrder(user.id, { quantity: 3 });

    stripe.nextEvent = {
      id: 'evt_success_dup',
      type: 'payment_intent.succeeded',
      data: { object: { id: order.providerRef, metadata: { orderId: order.id, tickets: '[]' } } },
    };

    const first = await app.inject({
      method: 'POST',
      url: '/stripe/webhook',
      headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=x' },
      payload: rawJson(stripe.nextEvent),
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: 'POST',
      url: '/stripe/webhook',
      headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=x' },
      payload: rawJson(stripe.nextEvent),
    });
    expect(second.statusCode).toBe(200);
    expect(second.json()).toMatchObject({ deduped: true });

    const tickets = await prisma.ticket.findMany({ where: { orderId: order.id } });
    expect(tickets).toHaveLength(3);
  });

  it('dedupes concurrent webhook deliveries for the same Stripe event id', async () => {
    const { user } = await createUser({ verified: true });
    const { order } = await seedEventTierOrder(user.id, { quantity: 3 });

    stripe.nextEvent = {
      id: 'evt_success_concurrent',
      type: 'payment_intent.succeeded',
      data: { object: { id: order.providerRef, metadata: { orderId: order.id, tickets: '[]' } } },
    };

    const [a, b] = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/stripe/webhook',
        headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=x' },
        payload: rawJson(stripe.nextEvent),
      }),
      app.inject({
        method: 'POST',
        url: '/stripe/webhook',
        headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=x' },
        payload: rawJson(stripe.nextEvent),
      }),
    ]);

    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);

    const dedupRows = await prisma.paymentWebhookEvent.findMany({
      where: { provider: 'stripe', eventId: 'evt_success_concurrent' },
    });
    expect(dedupRows).toHaveLength(1);

    const tickets = await prisma.ticket.findMany({ where: { orderId: order.id } });
    expect(tickets).toHaveLength(3);
  });

  it('handles payment_intent.payment_failed: marks order failed + releases reservation', async () => {
    const { user } = await createUser({ verified: true });
    const { tier, order } = await seedEventTierOrder(user.id);

    stripe.nextEvent = {
      id: 'evt_fail_1',
      type: 'payment_intent.payment_failed',
      data: { object: { id: order.providerRef, metadata: { orderId: order.id } } },
    };

    const res = await app.inject({
      method: 'POST',
      url: '/stripe/webhook',
      headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=x' },
      payload: rawJson(stripe.nextEvent),
    });
    expect(res.statusCode).toBe(200);

    const reloaded = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(reloaded.status).toBe('failed');

    const reloadedTier = await prisma.ticketTier.findUniqueOrThrow({ where: { id: tier.id } });
    expect(reloadedTier.quantitySold).toBe(0);

    const tickets = await prisma.ticket.findMany({ where: { orderId: order.id } });
    expect(tickets).toHaveLength(0);
  });

  it('releases full tier reservation when payment_failed order quantity is greater than 1', async () => {
    const { user } = await createUser({ verified: true });
    const { tier, order } = await seedEventTierOrder(user.id, { quantity: 3 });

    stripe.nextEvent = {
      id: 'evt_fail_qty_3',
      type: 'payment_intent.payment_failed',
      data: { object: { id: order.providerRef, metadata: { orderId: order.id } } },
    };

    const res = await app.inject({
      method: 'POST',
      url: '/stripe/webhook',
      headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=x' },
      payload: rawJson(stripe.nextEvent),
    });
    expect(res.statusCode).toBe(200);

    const reloaded = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(reloaded.status).toBe('failed');

    const reloadedTier = await prisma.ticketTier.findUniqueOrThrow({ where: { id: tier.id } });
    expect(reloadedTier.quantitySold).toBe(0);
  });

  it('no-ops on unknown event type', async () => {
    stripe.nextEvent = {
      id: 'evt_unknown_1',
      type: 'charge.captured',
      data: { object: {} },
    };
    const res = await app.inject({
      method: 'POST',
      url: '/stripe/webhook',
      headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=x' },
      payload: rawJson(stripe.nextEvent),
    });
    expect(res.statusCode).toBe(200);
  });

  it('does not mark event processed when dispatch fails with a non-duplicate error', async () => {
    stripe.nextEvent = {
      id: 'evt_dispatch_fail',
      type: 'payment_intent.succeeded',
      // orderId that does not exist -> OrderNotFoundError propagates.
      data: { object: { id: 'pi_test_missing', metadata: { orderId: 'missing-order-id' } } },
    };

    const res = await app.inject({
      method: 'POST',
      url: '/stripe/webhook',
      headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=x' },
      payload: rawJson(stripe.nextEvent),
    });
    expect(res.statusCode).toBe(500);

    const dedupRow = await prisma.paymentWebhookEvent.findFirst({
      where: { eventId: 'evt_dispatch_fail' },
    });
    expect(dedupRow).toBeNull();
  });

  it('refunds and marks processed when payment_intent.succeeded arrives for an expired order', async () => {
    const { user } = await createUser({ verified: true });
    const { tier, order } = await seedEventTierOrder(user.id);

    // Simulate the order having been expired (e.g. via GET /orders/:id lazy expiry)
    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'expired', expiresAt: new Date(Date.now() - 1000) },
    });
    await prisma.ticketTier.update({ where: { id: tier.id }, data: { quantitySold: 0 } });

    stripe.nextEvent = {
      id: 'evt_expired_order',
      type: 'payment_intent.succeeded',
      data: { object: { id: order.providerRef, metadata: { orderId: order.id } } },
    };

    const res = await app.inject({
      method: 'POST',
      url: '/stripe/webhook',
      headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=x' },
      payload: rawJson(stripe.nextEvent),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ refunded: true, reason: 'expired' });

    const refundCalls = stripe.calls.filter((c) => c.kind === 'refund');
    expect(refundCalls).toHaveLength(1);
    expect(refundCalls[0]?.payload).toMatchObject({ paymentIntentId: order.providerRef });

    // No ticket issued
    const ticket = await prisma.ticket.findFirst({ where: { orderId: order.id } });
    expect(ticket).toBeNull();

    // Dedup row written so Stripe retries short-circuit
    const dedupRow = await prisma.paymentWebhookEvent.findFirst({
      where: { eventId: 'evt_expired_order' },
    });
    expect(dedupRow).not.toBeNull();
  });
});
