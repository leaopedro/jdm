import { randomUUID } from 'node:crypto';

import { prisma } from '@jdm/db';
import {
  adminFinanceByEventResponseSchema,
  adminFinanceByProductResponseSchema,
  adminFinancePaymentMixResponseSchema,
  adminFinanceSummarySchema,
  adminFinanceTrendResponseSchema,
} from '@jdm/shared/admin';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadEnv } from '../../src/env.js';
import { bearer, createUser, makeApp, resetDatabase } from '../helpers.js';

async function seedEvent(slug: string, city = 'São Paulo', stateCode = 'SP') {
  return prisma.event.create({
    data: {
      slug,
      title: `Evento ${slug}`,
      description: 'desc',
      startsAt: new Date('2026-06-01T19:00:00Z'),
      endsAt: new Date('2026-06-01T23:00:00Z'),
      venueName: 'v',
      venueAddress: 'a',
      city,
      stateCode,
      type: 'meeting',
      capacity: 100,
      status: 'published',
      publishedAt: new Date(),
    },
  });
}

async function seedTier(eventId: string, priceCents = 5000) {
  return prisma.ticketTier.create({
    data: {
      eventId,
      name: 'Standard',
      priceCents,
      currency: 'BRL',
      quantityTotal: 100,
      quantitySold: 0,
      sortOrder: 0,
    },
  });
}

async function seedExtra(eventId: string, priceCents = 2000) {
  return prisma.ticketExtra.create({
    data: {
      eventId,
      name: 'Estacionamento',
      priceCents,
      quantityTotal: null,
      active: true,
    },
  });
}

type SeedOrderItemInput =
  | {
      kind: 'ticket';
      tierId: string;
      quantity?: number;
      unitPriceCents: number;
      subtotalCents?: number;
    }
  | {
      kind: 'extras';
      extraId: string;
      quantity?: number;
      unitPriceCents: number;
      subtotalCents?: number;
    }
  | {
      kind: 'product';
      variantId?: string | null;
      quantity?: number;
      unitPriceCents: number;
      subtotalCents?: number;
    };

async function seedOrder(
  userId: string,
  eventId: string | null,
  tierId: string | null,
  overrides: Partial<{
    amountCents: number;
    method: 'card' | 'pix';
    provider: 'stripe' | 'abacatepay';
    status: 'paid' | 'refunded' | 'pending';
    paidAt: Date | null;
    kind: 'ticket' | 'extras_only' | 'product' | 'mixed';
    orderItems: SeedOrderItemInput[];
  }> = {},
): Promise<{ id: string }> {
  const orderItems = overrides.orderItems ?? [];
  const amountCents =
    overrides.amountCents ??
    (orderItems.length > 0
      ? orderItems.reduce(
          (sum, item) => sum + (item.subtotalCents ?? item.unitPriceCents * (item.quantity ?? 1)),
          0,
        )
      : 5000);

  const providerRef = `pi_${Math.random().toString(36).slice(2)}`;
  const status = overrides.status ?? 'paid';
  const method = overrides.method ?? 'card';
  const provider = overrides.provider ?? 'stripe';
  const kind = overrides.kind ?? 'ticket';
  const paidAt = overrides.paidAt ?? new Date('2026-05-01T12:00:00Z');

  const order =
    eventId === null && tierId === null
      ? await (async () => {
          const orderId = randomUUID();
          await prisma.$executeRawUnsafe(
            `INSERT INTO "Order" ("id", "userId", "eventId", "tierId", "kind", "amountCents", "currency", "method", "provider", "providerRef", "quantity", "status", "paidAt", "createdAt", "updatedAt")
             VALUES ($1, $2, NULL, NULL, $3::"OrderKind", $4, $5, $6::"PaymentMethod", $7::"PaymentProvider", $8, 1, $9::"OrderStatus", $10, NOW(), NOW())`,
            orderId,
            userId,
            kind,
            amountCents,
            'BRL',
            method,
            provider,
            providerRef,
            status,
            paidAt,
          );
          return { id: orderId };
        })()
      : await prisma.order.create({
          data: {
            userId,
            eventId,
            tierId,
            kind,
            amountCents,
            currency: 'BRL',
            method,
            provider,
            status,
            paidAt,
            providerRef,
          },
        });

  if (orderItems.length > 0) {
    for (const item of orderItems) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "OrderItem" ("id", "orderId", "kind", "variantId", "tierId", "extraId", "quantity", "unitPriceCents", "subtotalCents", "createdAt")
         VALUES ($1, $2, $3::"OrderItemKind", $4, $5, $6, $7, $8, $9, NOW())`,
        randomUUID(),
        order.id,
        item.kind,
        item.kind === 'product' ? (item.variantId ?? null) : null,
        item.kind === 'ticket' ? item.tierId : null,
        item.kind === 'extras' ? item.extraId : null,
        item.quantity ?? 1,
        item.unitPriceCents,
        item.subtotalCents ?? item.unitPriceCents * (item.quantity ?? 1),
      );
    }
  }

  return order;
}

describe('Admin Finance Endpoints', () => {
  let app: FastifyInstance;
  const env = loadEnv();

  beforeEach(async () => {
    await resetDatabase();
    app = await makeApp();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /admin/finance/summary', () => {
    it('returns 401 without auth', async () => {
      const res = await app.inject({ method: 'GET', url: '/admin/finance/summary' });
      expect(res.statusCode).toBe(401);
    });

    it('returns 403 for user role', async () => {
      const { user } = await createUser({ email: 'u@jdm.test', verified: true, role: 'user' });
      const res = await app.inject({
        method: 'GET',
        url: '/admin/finance/summary',
        headers: { authorization: bearer(env, user.id, 'user') },
      });
      expect(res.statusCode).toBe(403);
    });

    it('returns zero-state when no orders exist', async () => {
      const { user } = await createUser({ email: 'admin@jdm.test', verified: true, role: 'admin' });
      const res = await app.inject({
        method: 'GET',
        url: '/admin/finance/summary',
        headers: { authorization: bearer(env, user.id, 'admin') },
      });
      expect(res.statusCode).toBe(200);
      const body = adminFinanceSummarySchema.parse(res.json());
      expect(body.totalRevenueCents).toBe(0);
      expect(body.orderCount).toBe(0);
      expect(body.avgOrderCents).toBe(0);
      expect(body.ticketCount).toBe(0);
      expect(body.refundedCents).toBe(0);
      expect(body.refundedCount).toBe(0);
    });

    it('computes summary from paid orders', async () => {
      const { user: admin } = await createUser({
        email: 'admin@jdm.test',
        verified: true,
        role: 'admin',
      });
      const { user: buyer } = await createUser({ email: 'buyer@jdm.test', verified: true });
      const event = await seedEvent('meet-sp');
      const tier = await seedTier(event.id);

      await seedOrder(buyer.id, event.id, tier.id, { amountCents: 10000, status: 'paid' });
      await seedOrder(buyer.id, event.id, tier.id, { amountCents: 5000, status: 'paid' });
      await seedOrder(buyer.id, event.id, tier.id, { amountCents: 3000, status: 'refunded' });

      const res = await app.inject({
        method: 'GET',
        url: '/admin/finance/summary',
        headers: { authorization: bearer(env, admin.id, 'admin') },
      });
      expect(res.statusCode).toBe(200);
      const body = adminFinanceSummarySchema.parse(res.json());
      expect(body.totalRevenueCents).toBe(15000);
      expect(body.orderCount).toBe(2);
      expect(body.avgOrderCents).toBe(7500);
      expect(body.refundedCents).toBe(3000);
      expect(body.refundedCount).toBe(1);
    });

    it('prefers order item revenue and falls back to legacy order amounts', async () => {
      const { user: admin } = await createUser({
        email: 'admin@jdm.test',
        verified: true,
        role: 'admin',
      });
      const { user: buyer } = await createUser({ email: 'buyer@jdm.test', verified: true });
      const event = await seedEvent('meet-sp');
      const tier = await seedTier(event.id, 10000);
      const extra = await seedExtra(event.id, 2000);
      await seedOrder(buyer.id, event.id, tier.id, {
        amountCents: 99000,
        orderItems: [
          { kind: 'ticket', tierId: tier.id, unitPriceCents: 10000 },
          { kind: 'extras', extraId: extra.id, unitPriceCents: 2000 },
        ],
      });
      await seedOrder(buyer.id, event.id, tier.id, { amountCents: 7000 });
      await seedOrder(buyer.id, null, null, {
        kind: 'product',
        orderItems: [{ kind: 'product', unitPriceCents: 5000 }],
      });
      await seedOrder(buyer.id, null, null, {
        kind: 'product',
        amountCents: 42000,
        status: 'refunded',
        orderItems: [{ kind: 'product', unitPriceCents: 4500 }],
      });

      const res = await app.inject({
        method: 'GET',
        url: '/admin/finance/summary',
        headers: { authorization: bearer(env, admin.id, 'admin') },
      });
      expect(res.statusCode).toBe(200);
      const body = adminFinanceSummarySchema.parse(res.json());
      expect(body.totalRevenueCents).toBe(24000);
      expect(body.orderCount).toBe(3);
      expect(body.avgOrderCents).toBe(8000);
      expect(body.refundedCents).toBe(4500);
      expect(body.refundedCount).toBe(1);
      expect(body.storeRevenueCents).toBe(5000);
      expect(body.storeOrderCount).toBe(1);
    });

    it('filters by date range', async () => {
      const { user: admin } = await createUser({
        email: 'admin@jdm.test',
        verified: true,
        role: 'admin',
      });
      const { user: buyer } = await createUser({ email: 'buyer@jdm.test', verified: true });
      const event = await seedEvent('meet-sp');
      const tier = await seedTier(event.id);

      await seedOrder(buyer.id, event.id, tier.id, {
        amountCents: 10000,
        paidAt: new Date('2026-04-01T12:00:00Z'),
      });
      await seedOrder(buyer.id, event.id, tier.id, {
        amountCents: 5000,
        paidAt: new Date('2026-05-15T12:00:00Z'),
      });

      const res = await app.inject({
        method: 'GET',
        url: '/admin/finance/summary?from=2026-05-01&to=2026-05-31',
        headers: { authorization: bearer(env, admin.id, 'admin') },
      });
      expect(res.statusCode).toBe(200);
      const body = adminFinanceSummarySchema.parse(res.json());
      expect(body.totalRevenueCents).toBe(5000);
      expect(body.orderCount).toBe(1);
    });

    it('filters by provider', async () => {
      const { user: admin } = await createUser({
        email: 'admin@jdm.test',
        verified: true,
        role: 'admin',
      });
      const { user: buyer } = await createUser({ email: 'buyer@jdm.test', verified: true });
      const event = await seedEvent('meet-sp');
      const tier = await seedTier(event.id);

      await seedOrder(buyer.id, event.id, tier.id, { amountCents: 10000, provider: 'stripe' });
      await seedOrder(buyer.id, event.id, tier.id, { amountCents: 5000, provider: 'abacatepay' });

      const res = await app.inject({
        method: 'GET',
        url: '/admin/finance/summary?provider=stripe',
        headers: { authorization: bearer(env, admin.id, 'admin') },
      });
      expect(res.statusCode).toBe(200);
      const body = adminFinanceSummarySchema.parse(res.json());
      expect(body.totalRevenueCents).toBe(10000);
    });

    it('filters by eventIds', async () => {
      const { user: admin } = await createUser({
        email: 'admin@jdm.test',
        verified: true,
        role: 'admin',
      });
      const { user: buyer } = await createUser({ email: 'buyer@jdm.test', verified: true });
      const event1 = await seedEvent('meet-sp', 'São Paulo', 'SP');
      const event2 = await seedEvent('meet-rj', 'Rio de Janeiro', 'RJ');
      const tier1 = await seedTier(event1.id);
      const tier2 = await seedTier(event2.id);

      await seedOrder(buyer.id, event1.id, tier1.id, { amountCents: 10000 });
      await seedOrder(buyer.id, event2.id, tier2.id, { amountCents: 5000 });

      const res = await app.inject({
        method: 'GET',
        url: `/admin/finance/summary?eventIds=${event1.id}`,
        headers: { authorization: bearer(env, admin.id, 'admin') },
      });
      expect(res.statusCode).toBe(200);
      const body = adminFinanceSummarySchema.parse(res.json());
      expect(body.totalRevenueCents).toBe(10000);
      expect(body.orderCount).toBe(1);
    });

    it('filters by method', async () => {
      const { user: admin } = await createUser({
        email: 'admin@jdm.test',
        verified: true,
        role: 'admin',
      });
      const { user: buyer } = await createUser({ email: 'buyer@jdm.test', verified: true });
      const event = await seedEvent('meet-sp');
      const tier = await seedTier(event.id);

      await seedOrder(buyer.id, event.id, tier.id, { amountCents: 10000, method: 'card' });
      await seedOrder(buyer.id, event.id, tier.id, { amountCents: 5000, method: 'pix' });

      const res = await app.inject({
        method: 'GET',
        url: '/admin/finance/summary?method=pix',
        headers: { authorization: bearer(env, admin.id, 'admin') },
      });
      expect(res.statusCode).toBe(200);
      const body = adminFinanceSummarySchema.parse(res.json());
      expect(body.totalRevenueCents).toBe(5000);
    });
  });

  describe('GET /admin/finance/by-event', () => {
    it('returns empty array when no orders', async () => {
      const { user: admin } = await createUser({
        email: 'admin@jdm.test',
        verified: true,
        role: 'admin',
      });
      const res = await app.inject({
        method: 'GET',
        url: '/admin/finance/by-event',
        headers: { authorization: bearer(env, admin.id, 'admin') },
      });
      expect(res.statusCode).toBe(200);
      const body = adminFinanceByEventResponseSchema.parse(res.json());
      expect(body.items).toEqual([]);
    });

    it('groups revenue by event', async () => {
      const { user: admin } = await createUser({
        email: 'admin@jdm.test',
        verified: true,
        role: 'admin',
      });
      const { user: buyer } = await createUser({ email: 'buyer@jdm.test', verified: true });
      const event1 = await seedEvent('meet-sp', 'São Paulo', 'SP');
      const event2 = await seedEvent('meet-rj', 'Rio de Janeiro', 'RJ');
      const tier1 = await seedTier(event1.id);
      const tier2 = await seedTier(event2.id);

      await seedOrder(buyer.id, event1.id, tier1.id, { amountCents: 10000 });
      await seedOrder(buyer.id, event1.id, tier1.id, { amountCents: 5000 });
      await seedOrder(buyer.id, event2.id, tier2.id, { amountCents: 8000 });

      const res = await app.inject({
        method: 'GET',
        url: '/admin/finance/by-event',
        headers: { authorization: bearer(env, admin.id, 'admin') },
      });
      expect(res.statusCode).toBe(200);
      const body = adminFinanceByEventResponseSchema.parse(res.json());
      expect(body.items).toHaveLength(2);
      // Sorted by revenue descending
      const first = body.items[0]!;
      const second = body.items[1]!;
      expect(first.revenueCents).toBe(15000);
      expect(first.eventTitle).toBe('Evento meet-sp');
      expect(second.revenueCents).toBe(8000);
    });

    it('filters by city', async () => {
      const { user: admin } = await createUser({
        email: 'admin@jdm.test',
        verified: true,
        role: 'admin',
      });
      const { user: buyer } = await createUser({ email: 'buyer@jdm.test', verified: true });
      const event1 = await seedEvent('meet-sp', 'São Paulo', 'SP');
      const event2 = await seedEvent('meet-rj', 'Rio de Janeiro', 'RJ');
      const tier1 = await seedTier(event1.id);
      const tier2 = await seedTier(event2.id);

      await seedOrder(buyer.id, event1.id, tier1.id, { amountCents: 10000 });
      await seedOrder(buyer.id, event2.id, tier2.id, { amountCents: 8000 });

      const res = await app.inject({
        method: 'GET',
        url: '/admin/finance/by-event?city=S%C3%A3o%20Paulo',
        headers: { authorization: bearer(env, admin.id, 'admin') },
      });
      expect(res.statusCode).toBe(200);
      const body = adminFinanceByEventResponseSchema.parse(res.json());
      expect(body.items).toHaveLength(1);
      expect(body.items[0]!.city).toBe('São Paulo');
    });

    it('reports revenueCents from paid only, refundedCents separately', async () => {
      const { user: admin } = await createUser({
        email: 'admin@jdm.test',
        verified: true,
        role: 'admin',
      });
      const { user: buyer } = await createUser({ email: 'buyer@jdm.test', verified: true });
      const event = await seedEvent('meet-sp');
      const tier = await seedTier(event.id);

      await seedOrder(buyer.id, event.id, tier.id, { amountCents: 10000, status: 'paid' });
      await seedOrder(buyer.id, event.id, tier.id, { amountCents: 3000, status: 'refunded' });

      const res = await app.inject({
        method: 'GET',
        url: '/admin/finance/by-event',
        headers: { authorization: bearer(env, admin.id, 'admin') },
      });
      expect(res.statusCode).toBe(200);
      const body = adminFinanceByEventResponseSchema.parse(res.json());
      expect(body.items).toHaveLength(1);
      const row = body.items[0]!;
      expect(row.revenueCents).toBe(10000);
      expect(row.refundedCents).toBe(3000);
      expect(row.orderCount).toBe(1);
    });

    it('groups event revenue from order items and skips store-only orders', async () => {
      const { user: admin } = await createUser({
        email: 'admin@jdm.test',
        verified: true,
        role: 'admin',
      });
      const { user: buyer } = await createUser({ email: 'buyer@jdm.test', verified: true });
      const event1 = await seedEvent('meet-sp');
      const event2 = await seedEvent('meet-rj', 'Rio de Janeiro', 'RJ');
      const tier1 = await seedTier(event1.id, 10000);
      const tier2 = await seedTier(event2.id, 8000);
      const extra = await seedExtra(event1.id, 2000);
      await seedOrder(buyer.id, event1.id, tier1.id, {
        amountCents: 99999,
        orderItems: [
          { kind: 'ticket', tierId: tier1.id, unitPriceCents: 10000 },
          { kind: 'extras', extraId: extra.id, unitPriceCents: 2000 },
        ],
      });
      await seedOrder(buyer.id, event1.id, tier1.id, {
        amountCents: 1000,
        status: 'refunded',
        orderItems: [{ kind: 'extras', extraId: extra.id, unitPriceCents: 2000 }],
      });
      await seedOrder(buyer.id, event2.id, tier2.id, { amountCents: 8000 });
      await seedOrder(buyer.id, null, null, {
        kind: 'product',
        orderItems: [{ kind: 'product', unitPriceCents: 5000 }],
      });
      const res = await app.inject({
        method: 'GET',
        url: '/admin/finance/by-event',
        headers: { authorization: bearer(env, admin.id, 'admin') },
      });
      expect(res.statusCode).toBe(200);
      const body = adminFinanceByEventResponseSchema.parse(res.json());
      expect(body.items).toHaveLength(2);
      const first = body.items[0]!;
      const second = body.items[1]!;
      expect(first.eventId).toBe(event1.id);
      expect(first.revenueCents).toBe(12000);
      expect(first.refundedCents).toBe(2000);
      expect(second.eventId).toBe(event2.id);
      expect(second.revenueCents).toBe(8000);
    });
  });

  describe('GET /admin/finance/trends', () => {
    it('returns empty points with no orders', async () => {
      const { user: admin } = await createUser({
        email: 'admin@jdm.test',
        verified: true,
        role: 'admin',
      });
      const res = await app.inject({
        method: 'GET',
        url: '/admin/finance/trends',
        headers: { authorization: bearer(env, admin.id, 'admin') },
      });
      expect(res.statusCode).toBe(200);
      const body = adminFinanceTrendResponseSchema.parse(res.json());
      expect(body.points).toEqual([]);
    });

    it('buckets orders by day', async () => {
      const { user: admin } = await createUser({
        email: 'admin@jdm.test',
        verified: true,
        role: 'admin',
      });
      const { user: buyer } = await createUser({ email: 'buyer@jdm.test', verified: true });
      const event = await seedEvent('meet-sp');
      const tier = await seedTier(event.id);

      await seedOrder(buyer.id, event.id, tier.id, {
        amountCents: 10000,
        paidAt: new Date('2026-05-01T10:00:00Z'),
      });
      await seedOrder(buyer.id, event.id, tier.id, {
        amountCents: 5000,
        paidAt: new Date('2026-05-01T14:00:00Z'),
      });
      await seedOrder(buyer.id, event.id, tier.id, {
        amountCents: 3000,
        paidAt: new Date('2026-05-02T09:00:00Z'),
      });

      const res = await app.inject({
        method: 'GET',
        url: '/admin/finance/trends',
        headers: { authorization: bearer(env, admin.id, 'admin') },
      });
      expect(res.statusCode).toBe(200);
      const body = adminFinanceTrendResponseSchema.parse(res.json());
      expect(body.points).toHaveLength(2);
      expect(body.points[0]!).toEqual({
        date: '2026-05-01',
        revenueCents: 15000,
        orderCount: 2,
        ticketRevenueCents: 15000,
        storeRevenueCents: 0,
      });
      expect(body.points[1]!).toEqual({
        date: '2026-05-02',
        revenueCents: 3000,
        orderCount: 1,
        ticketRevenueCents: 3000,
        storeRevenueCents: 0,
      });
    });

    it('uses order item subtotals in trend buckets', async () => {
      const { user: admin } = await createUser({
        email: 'admin@jdm.test',
        verified: true,
        role: 'admin',
      });
      const { user: buyer } = await createUser({ email: 'buyer@jdm.test', verified: true });
      const event = await seedEvent('meet-sp');
      const tier = await seedTier(event.id, 10000);
      const extra = await seedExtra(event.id, 1500);

      await seedOrder(buyer.id, event.id, tier.id, {
        amountCents: 88888,
        paidAt: new Date('2026-05-03T10:00:00Z'),
        orderItems: [
          { kind: 'ticket', tierId: tier.id, unitPriceCents: 10000 },
          { kind: 'extras', extraId: extra.id, unitPriceCents: 1500 },
        ],
      });
      await seedOrder(buyer.id, event.id, tier.id, {
        amountCents: 5000,
        paidAt: new Date('2026-05-03T14:00:00Z'),
      });

      const res = await app.inject({
        method: 'GET',
        url: '/admin/finance/trends',
        headers: { authorization: bearer(env, admin.id, 'admin') },
      });
      expect(res.statusCode).toBe(200);
      const body = adminFinanceTrendResponseSchema.parse(res.json());
      expect(body.points).toEqual([
        {
          date: '2026-05-03',
          revenueCents: 16500,
          orderCount: 2,
          ticketRevenueCents: 15000,
          storeRevenueCents: 0,
        },
      ]);
    });
  });

  describe('GET /admin/finance/payment-mix', () => {
    it('returns empty items with no orders', async () => {
      const { user: admin } = await createUser({
        email: 'admin@jdm.test',
        verified: true,
        role: 'admin',
      });
      const res = await app.inject({
        method: 'GET',
        url: '/admin/finance/payment-mix',
        headers: { authorization: bearer(env, admin.id, 'admin') },
      });
      expect(res.statusCode).toBe(200);
      const body = adminFinancePaymentMixResponseSchema.parse(res.json());
      expect(body.items).toEqual([]);
    });

    it('groups by provider and method with percentage', async () => {
      const { user: admin } = await createUser({
        email: 'admin@jdm.test',
        verified: true,
        role: 'admin',
      });
      const { user: buyer } = await createUser({ email: 'buyer@jdm.test', verified: true });
      const event = await seedEvent('meet-sp');
      const tier = await seedTier(event.id);

      await seedOrder(buyer.id, event.id, tier.id, {
        amountCents: 10000,
        provider: 'stripe',
        method: 'card',
      });
      await seedOrder(buyer.id, event.id, tier.id, {
        amountCents: 10000,
        provider: 'abacatepay',
        method: 'pix',
      });

      const res = await app.inject({
        method: 'GET',
        url: '/admin/finance/payment-mix',
        headers: { authorization: bearer(env, admin.id, 'admin') },
      });
      expect(res.statusCode).toBe(200);
      const body = adminFinancePaymentMixResponseSchema.parse(res.json());
      expect(body.items).toHaveLength(2);
      for (const item of body.items) {
        expect(item.percentage).toBe(50);
        expect(item.revenueCents).toBe(10000);
        expect(item.orderCount).toBe(1);
      }
    });

    it('uses order item subtotals for payment mix revenue', async () => {
      const { user: admin } = await createUser({
        email: 'admin@jdm.test',
        verified: true,
        role: 'admin',
      });
      const { user: buyer } = await createUser({ email: 'buyer@jdm.test', verified: true });
      const event = await seedEvent('meet-sp');
      const tier = await seedTier(event.id, 10000);
      const extra = await seedExtra(event.id, 2000);
      await seedOrder(buyer.id, event.id, tier.id, {
        amountCents: 123456,
        provider: 'stripe',
        method: 'card',
        orderItems: [
          { kind: 'ticket', tierId: tier.id, unitPriceCents: 10000 },
          { kind: 'extras', extraId: extra.id, unitPriceCents: 2000 },
        ],
      });
      await seedOrder(buyer.id, null, null, {
        kind: 'product',
        provider: 'abacatepay',
        method: 'pix',
        orderItems: [{ kind: 'product', unitPriceCents: 6000 }],
      });

      const res = await app.inject({
        method: 'GET',
        url: '/admin/finance/payment-mix',
        headers: { authorization: bearer(env, admin.id, 'admin') },
      });
      expect(res.statusCode).toBe(200);
      const body = adminFinancePaymentMixResponseSchema.parse(res.json());
      expect(body.items).toHaveLength(2);

      const stripe = body.items.find((item) => item.provider === 'stripe');
      const pix = body.items.find((item) => item.provider === 'abacatepay');
      expect(stripe).toMatchObject({
        provider: 'stripe',
        method: 'card',
        revenueCents: 12000,
        orderCount: 1,
      });
      expect(pix).toMatchObject({
        provider: 'abacatepay',
        method: 'pix',
        revenueCents: 6000,
        orderCount: 1,
      });
    });
  });

  describe('GET /admin/finance/by-product', () => {
    it('returns empty items when no product orders exist', async () => {
      const { user: admin } = await createUser({
        email: 'admin@jdm.test',
        verified: true,
        role: 'admin',
      });
      const res = await app.inject({
        method: 'GET',
        url: '/admin/finance/by-product',
        headers: { authorization: bearer(env, admin.id, 'admin') },
      });
      expect(res.statusCode).toBe(200);
      const body = adminFinanceByProductResponseSchema.parse(res.json());
      expect(body.items).toEqual([]);
    });

    it('groups product revenue by product', async () => {
      const { user: admin } = await createUser({
        email: 'admin@jdm.test',
        verified: true,
        role: 'admin',
      });
      const { user: buyer } = await createUser({ email: 'buyer@jdm.test', verified: true });

      const productType = await prisma.productType.create({ data: { name: 'Camiseta' } });
      const product1 = await prisma.product.create({
        data: {
          slug: 'camiseta-preta',
          title: 'Camiseta Preta',
          description: 'desc',
          productTypeId: productType.id,
          basePriceCents: 5000,
          status: 'active',
        },
      });
      const product2 = await prisma.product.create({
        data: {
          slug: 'bone-jdm',
          title: 'Boné JDM',
          description: 'desc',
          productTypeId: productType.id,
          basePriceCents: 3000,
          status: 'active',
        },
      });
      const variant1 = await prisma.variant.create({
        data: {
          productId: product1.id,
          name: 'M',
          priceCents: 5000,
          quantityTotal: 10,
          attributes: {},
        },
      });
      const variant2 = await prisma.variant.create({
        data: {
          productId: product2.id,
          name: 'Único',
          priceCents: 3000,
          quantityTotal: 10,
          attributes: {},
        },
      });

      await seedOrder(buyer.id, null, null, {
        kind: 'product',
        orderItems: [{ kind: 'product', variantId: variant1.id, unitPriceCents: 5000 }],
      });
      await seedOrder(buyer.id, null, null, {
        kind: 'product',
        orderItems: [
          { kind: 'product', variantId: variant1.id, unitPriceCents: 5000 },
          { kind: 'product', variantId: variant2.id, unitPriceCents: 3000 },
        ],
      });

      const res = await app.inject({
        method: 'GET',
        url: '/admin/finance/by-product',
        headers: { authorization: bearer(env, admin.id, 'admin') },
      });
      expect(res.statusCode).toBe(200);
      const body = adminFinanceByProductResponseSchema.parse(res.json());
      expect(body.items).toHaveLength(2);

      const shirt = body.items.find((i) => i.productId === product1.id);
      const cap = body.items.find((i) => i.productId === product2.id);

      expect(shirt).toMatchObject({
        productTitle: 'Camiseta Preta',
        orderCount: 2,
        quantitySold: 2,
        revenueCents: 10000,
      });
      expect(cap).toMatchObject({
        productTitle: 'Boné JDM',
        orderCount: 1,
        quantitySold: 1,
        revenueCents: 3000,
      });
    });

    it('excludes ticket-only orders from by-product', async () => {
      const { user: admin } = await createUser({
        email: 'admin@jdm.test',
        verified: true,
        role: 'admin',
      });
      const { user: buyer } = await createUser({ email: 'buyer@jdm.test', verified: true });
      const event = await seedEvent('meet-sp');
      const tier = await seedTier(event.id);

      await seedOrder(buyer.id, event.id, tier.id, { amountCents: 10000 });

      const res = await app.inject({
        method: 'GET',
        url: '/admin/finance/by-product',
        headers: { authorization: bearer(env, admin.id, 'admin') },
      });
      expect(res.statusCode).toBe(200);
      const body = adminFinanceByProductResponseSchema.parse(res.json());
      expect(body.items).toEqual([]);
    });

    it('returns 401 without auth', async () => {
      const res = await app.inject({ method: 'GET', url: '/admin/finance/by-product' });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /admin/finance/export', () => {
    it('returns CSV content type', async () => {
      const { user: admin } = await createUser({
        email: 'admin@jdm.test',
        verified: true,
        role: 'admin',
      });
      const res = await app.inject({
        method: 'GET',
        url: '/admin/finance/export',
        headers: { authorization: bearer(env, admin.id, 'admin') },
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('finance-export.csv');
    });

    it('includes header row and order data', async () => {
      const { user: admin } = await createUser({
        email: 'admin@jdm.test',
        verified: true,
        role: 'admin',
      });
      const { user: buyer } = await createUser({ email: 'buyer@jdm.test', verified: true });
      const event = await seedEvent('meet-sp');
      const tier = await seedTier(event.id);

      await seedOrder(buyer.id, event.id, tier.id, { amountCents: 10000 });

      const res = await app.inject({
        method: 'GET',
        url: '/admin/finance/export',
        headers: { authorization: bearer(env, admin.id, 'admin') },
      });
      expect(res.statusCode).toBe(200);
      const lines = res.body.split('\n');
      expect(lines[0]).toBe(
        'id,event,city,state,user_name,user_email,amount_cents,currency,method,provider,status,quantity,paid_at,created_at',
      );
      expect(lines).toHaveLength(2); // header + 1 row
      expect(lines[1]).toContain('10000');
      expect(lines[1]).toContain('Evento meet-sp');
    });

    it('respects filters', async () => {
      const { user: admin } = await createUser({
        email: 'admin@jdm.test',
        verified: true,
        role: 'admin',
      });
      const { user: buyer } = await createUser({ email: 'buyer@jdm.test', verified: true });
      const event = await seedEvent('meet-sp');
      const tier = await seedTier(event.id);

      await seedOrder(buyer.id, event.id, tier.id, { amountCents: 10000, provider: 'stripe' });
      await seedOrder(buyer.id, event.id, tier.id, { amountCents: 5000, provider: 'abacatepay' });

      const res = await app.inject({
        method: 'GET',
        url: '/admin/finance/export?provider=stripe',
        headers: { authorization: bearer(env, admin.id, 'admin') },
      });
      expect(res.statusCode).toBe(200);
      const lines = res.body.split('\n');
      expect(lines).toHaveLength(2); // header + 1 stripe order
      expect(lines[1]).toContain('stripe');
    });

    it('escapes CSV fields with commas', async () => {
      const { user: admin } = await createUser({
        email: 'admin@jdm.test',
        verified: true,
        role: 'admin',
      });
      const { user: buyer } = await createUser({
        email: 'buyer@jdm.test',
        name: 'User, With Comma',
        verified: true,
      });
      const event = await seedEvent('meet-sp');
      const tier = await seedTier(event.id);
      await seedOrder(buyer.id, event.id, tier.id, { amountCents: 5000 });

      const res = await app.inject({
        method: 'GET',
        url: '/admin/finance/export',
        headers: { authorization: bearer(env, admin.id, 'admin') },
      });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('"User, With Comma"');
    });
  });
});
