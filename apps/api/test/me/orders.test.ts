import { prisma } from '@jdm/db';
import { myOrdersResponseSchema } from '@jdm/shared/orders';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadEnv } from '../../src/env.js';
import { bearer, createUser, makeAppWithFakeStripe, resetDatabase } from '../helpers.js';

const env = loadEnv();

const seedEvent = async () => {
  const event = await prisma.event.create({
    data: {
      slug: `event-${Math.random().toString(36).slice(2, 8)}`,
      title: 'Encontro JDM',
      description: 'Pista liberada',
      startsAt: new Date('2026-06-10T18:00:00.000Z'),
      endsAt: new Date('2026-06-10T23:00:00.000Z'),
      venueName: 'Autódromo',
      city: 'São Paulo',
      stateCode: 'SP',
      type: 'meeting',
      status: 'published',
      publishedAt: new Date(),
      capacity: 200,
      maxTicketsPerUser: 5,
    },
  });
  const tier = await prisma.ticketTier.create({
    data: {
      eventId: event.id,
      name: 'Pista',
      priceCents: 8_000,
      currency: 'BRL',
      quantityTotal: 200,
    },
  });
  const extra = await prisma.ticketExtra.create({
    data: {
      eventId: event.id,
      name: 'Adesivo',
      description: 'Kit adesivo',
      priceCents: 2_000,
      currency: 'BRL',
      quantityTotal: 50,
    },
  });
  return { event, tier, extra };
};

const seedProductVariant = async () => {
  const productType = await prisma.productType.create({
    data: { name: `Merch ${Math.random().toString(36).slice(2, 6)}` },
  });
  const product = await prisma.product.create({
    data: {
      slug: `produto-${Math.random().toString(36).slice(2, 8)}`,
      title: 'Camiseta JDM',
      description: 'Algodão pesado',
      productTypeId: productType.id,
      basePriceCents: 12_000,
      currency: 'BRL',
      status: 'active',
      shippingFeeCents: 1_500,
    },
  });
  const variant = await prisma.variant.create({
    data: {
      productId: product.id,
      name: 'Preta / G',
      sku: `SKU-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      priceCents: 12_000,
      quantityTotal: 20,
      attributes: { size: 'G', color: 'Preta' },
      active: true,
    },
  });
  return { product, variant };
};

describe('GET /me/orders', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    await resetDatabase();
    ({ app } = await makeAppWithFakeStripe());
  });

  afterEach(async () => {
    await app.close();
  });

  it('lists product-only and mixed orders with fulfillment metadata and line items', async () => {
    const { user } = await createUser({ verified: true });
    const { event, tier, extra } = await seedEvent();
    const { variant } = await seedProductVariant();

    const productOnly = await prisma.order.create({
      data: {
        userId: user.id,
        kind: 'product',
        amountCents: 13_500,
        currency: 'BRL',
        quantity: 1,
        method: 'card',
        provider: 'stripe',
        status: 'paid',
        paidAt: new Date('2026-05-06T15:30:00.000Z'),
        shippingCents: 1_500,
        fulfillmentMethod: 'ship',
        fulfillmentStatus: 'shipped',
        createdAt: new Date('2026-05-06T15:00:00.000Z'),
        items: {
          create: [
            {
              kind: 'product',
              variantId: variant.id,
              quantity: 1,
              unitPriceCents: 12_000,
              subtotalCents: 12_000,
            },
          ],
        },
      },
    });

    const mixed = await prisma.order.create({
      data: {
        userId: user.id,
        eventId: event.id,
        tierId: tier.id,
        kind: 'mixed',
        amountCents: 23_500,
        currency: 'BRL',
        quantity: 1,
        method: 'card',
        provider: 'stripe',
        status: 'paid',
        paidAt: new Date('2026-05-07T18:30:00.000Z'),
        shippingCents: 1_500,
        fulfillmentMethod: 'ship',
        fulfillmentStatus: 'packed',
        createdAt: new Date('2026-05-07T18:00:00.000Z'),
        items: {
          create: [
            {
              kind: 'ticket',
              tierId: tier.id,
              eventId: event.id,
              quantity: 1,
              unitPriceCents: 8_000,
              subtotalCents: 8_000,
            },
            {
              kind: 'product',
              variantId: variant.id,
              quantity: 1,
              unitPriceCents: 12_000,
              subtotalCents: 12_000,
            },
            {
              kind: 'extras',
              extraId: extra.id,
              quantity: 1,
              unitPriceCents: 2_000,
              subtotalCents: 2_000,
            },
          ],
        },
      },
    });

    const issuedTicket = await prisma.ticket.create({
      data: {
        orderId: mixed.id,
        userId: user.id,
        eventId: event.id,
        tierId: tier.id,
        source: 'purchase',
        status: 'valid',
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/me/orders',
      headers: { authorization: bearer(env, user.id) },
    });

    expect(res.statusCode).toBe(200);
    const body = myOrdersResponseSchema.parse(res.json());
    expect(body.items).toHaveLength(2);

    const latest = body.items[0]!;
    const older = body.items[1]!;
    expect(latest).toMatchObject({
      kind: 'mixed',
      status: 'paid',
      containsTickets: true,
      containsStoreItems: true,
      fulfillmentMethod: 'ship',
      fulfillmentStatus: 'packed',
      event: { id: event.id, title: event.title },
    });
    expect(latest.shortId).toBe(latest.id.slice(-8).toUpperCase());
    expect(latest.shortId).toMatch(/^[0-9A-Z]{8}$/);
    expect(latest.items.map((item) => item.kind)).toEqual(['ticket', 'product', 'extras']);
    expect(latest.items[0]).toMatchObject({
      title: event.title,
      detail: tier.name,
      ticketIds: [issuedTicket.id],
    });
    expect(latest.items[1]).toMatchObject({ title: 'Camiseta JDM', detail: 'Preta / G' });
    expect(latest.items[1]?.ticketIds).toBeUndefined();
    expect(latest.items[2]).toMatchObject({ title: extra.name, detail: event.title });
    expect(latest.items[2]?.ticketIds).toBeUndefined();

    expect(older).toMatchObject({
      id: productOnly.id,
      shortId: productOnly.id.slice(-8).toUpperCase(),
      kind: 'product',
      containsTickets: false,
      containsStoreItems: true,
      fulfillmentStatus: 'shipped',
      fulfillmentMethod: 'ship',
      event: null,
    });
    expect(older.items).toEqual([
      expect.objectContaining({
        kind: 'product',
        title: 'Camiseta JDM',
        detail: 'Preta / G',
        quantity: 1,
      }),
    ]);
  });

  it('returns only the authenticated user orders', async () => {
    const { user } = await createUser({ verified: true });
    const { user: other } = await createUser({ email: 'other-orders@jdm.test', verified: true });

    await prisma.order.create({
      data: {
        userId: other.id,
        kind: 'product',
        amountCents: 5_000,
        currency: 'BRL',
        quantity: 1,
        method: 'card',
        provider: 'stripe',
        status: 'pending',
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/me/orders',
      headers: { authorization: bearer(env, user.id) },
    });

    expect(res.statusCode).toBe(200);
    const body = myOrdersResponseSchema.parse(res.json());
    expect(body.items).toEqual([]);
  });

  it('returns 401 when unauthenticated', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/me/orders',
    });

    expect(res.statusCode).toBe(401);
  });
});
