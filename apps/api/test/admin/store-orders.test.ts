import { prisma } from '@jdm/db';
import { adminStoreOrderDetailSchema, adminStoreOrderListResponseSchema } from '@jdm/shared/admin';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadEnv } from '../../src/env.js';
import { bearer, createUser, makeApp, resetDatabase } from '../helpers.js';

const ensureProductType = async () =>
  prisma.productType.upsert({
    where: { name: 'Vestuário' },
    update: {},
    create: { name: 'Vestuário' },
  });

const seedProduct = async (slug: string) => {
  const productType = await ensureProductType();
  return prisma.product.create({
    data: {
      slug,
      title: `Produto ${slug}`,
      description: 'Descrição',
      basePriceCents: 5000,
      productTypeId: productType.id,
      status: 'active',
      shippingFeeCents: 1500,
    },
  });
};

const seedVariant = (productId: string) =>
  prisma.variant.create({
    data: {
      productId,
      name: 'Padrão',
      priceCents: 5000,
      quantityTotal: 10,
      quantitySold: 1,
      attributes: { size: 'M' },
      active: true,
    },
  });

type OrderOpts = {
  status?: 'pending' | 'paid';
  fulfillmentMethod?: 'ship' | 'pickup';
  fulfillmentStatus?:
    | 'unfulfilled'
    | 'packed'
    | 'shipped'
    | 'delivered'
    | 'pickup_ready'
    | 'picked_up'
    | 'cancelled';
  withShippingAddress?: boolean;
};

const seedPaidProductOrder = async (userId: string, opts: OrderOpts = {}) => {
  const product = await seedProduct(`p-${Math.random().toString(36).slice(2, 8)}`);
  const variant = await seedVariant(product.id);
  let shippingAddressId: string | null = null;
  if (opts.withShippingAddress ?? true) {
    const addr = await prisma.shippingAddress.create({
      data: {
        userId,
        recipientName: 'Cliente Teste',
        line1: 'Rua das Flores',
        number: '123',
        district: 'Centro',
        city: 'Curitiba',
        stateCode: 'PR',
        postalCode: '80000-000',
        isDefault: false,
      },
    });
    shippingAddressId = addr.id;
  }
  const status = opts.status ?? 'paid';
  return prisma.order.create({
    data: {
      userId,
      kind: 'product',
      amountCents: 6500,
      quantity: 1,
      currency: 'BRL',
      method: 'card',
      provider: 'stripe',
      providerRef: `pi_${Math.random().toString(36).slice(2, 10)}`,
      shippingAddressId,
      shippingCents: 1500,
      fulfillmentMethod: opts.fulfillmentMethod ?? 'ship',
      fulfillmentStatus: opts.fulfillmentStatus ?? 'unfulfilled',
      status,
      paidAt: status === 'paid' ? new Date() : null,
      items: {
        create: {
          kind: 'product',
          variantId: variant.id,
          quantity: 1,
          unitPriceCents: 5000,
          subtotalCents: 5000,
        },
      },
    },
  });
};

const orgAuth = async () => {
  const { user } = await createUser({
    email: `org-${Math.random().toString(36).slice(2, 8)}@jdm.test`,
    verified: true,
    role: 'organizer',
  });
  return { user, header: bearer(loadEnv(), user.id, 'organizer') };
};

describe('Admin store orders queue', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    await resetDatabase();
    app = await makeApp();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /admin/store/orders', () => {
    it('returns only product and mixed orders with totals', async () => {
      const buyer = await createUser({ email: 'buyer@jdm.test', verified: true });
      await seedPaidProductOrder(buyer.user.id, { fulfillmentStatus: 'unfulfilled' });
      await seedPaidProductOrder(buyer.user.id, {
        fulfillmentStatus: 'shipped',
        fulfillmentMethod: 'ship',
      });
      await seedPaidProductOrder(buyer.user.id, {
        fulfillmentStatus: 'delivered',
        fulfillmentMethod: 'ship',
      });

      // Ticket-only order — must be excluded.
      const event = await prisma.event.create({
        data: {
          slug: 'evt-x',
          title: 'Evento X',
          description: 'd',
          startsAt: new Date(Date.now() + 86_400_000),
          endsAt: new Date(Date.now() + 90_000_000),
          city: 'SP',
          stateCode: 'SP',
          type: 'meeting',
          status: 'published',
          capacity: 10,
          maxTicketsPerUser: 5,
        },
      });
      const tier = await prisma.ticketTier.create({
        data: {
          eventId: event.id,
          name: 'Geral',
          priceCents: 5000,
          quantityTotal: 10,
          sortOrder: 0,
        },
      });
      await prisma.order.create({
        data: {
          userId: buyer.user.id,
          eventId: event.id,
          tierId: tier.id,
          kind: 'ticket',
          amountCents: 5000,
          quantity: 1,
          currency: 'BRL',
          method: 'card',
          provider: 'stripe',
          status: 'paid',
          paidAt: new Date(),
        },
      });

      const { header } = await orgAuth();
      const res = await app.inject({
        method: 'GET',
        url: '/admin/store/orders',
        headers: { authorization: header },
      });
      expect(res.statusCode).toBe(200);
      const body = adminStoreOrderListResponseSchema.parse(res.json());
      expect(body.items).toHaveLength(3);
      expect(body.items.every((i) => i.kind === 'product' || i.kind === 'mixed')).toBe(true);
      expect(body.totals.all).toBe(3);
      expect(body.totals.unfulfilled).toBe(1);
      expect(body.totals.shipped).toBe(1);
      expect(body.totals.delivered).toBe(1);
      expect(body.totals.open).toBe(2); // unfulfilled + shipped (not terminal)
    });

    it('filters by status=open', async () => {
      const buyer = await createUser({ email: 'buyer2@jdm.test', verified: true });
      await seedPaidProductOrder(buyer.user.id, { fulfillmentStatus: 'unfulfilled' });
      await seedPaidProductOrder(buyer.user.id, { fulfillmentStatus: 'delivered' });
      await seedPaidProductOrder(buyer.user.id, { fulfillmentStatus: 'cancelled' });

      const { header } = await orgAuth();
      const res = await app.inject({
        method: 'GET',
        url: '/admin/store/orders?status=open',
        headers: { authorization: header },
      });
      const body = adminStoreOrderListResponseSchema.parse(res.json());
      expect(body.items).toHaveLength(1);
      expect(body.items[0]!.fulfillmentStatus).toBe('unfulfilled');
    });

    it('filters by q on customer email', async () => {
      const target = await createUser({ email: 'pedido-target@jdm.test', verified: true });
      const other = await createUser({ email: 'noise@jdm.test', verified: true });
      await seedPaidProductOrder(target.user.id);
      await seedPaidProductOrder(other.user.id);

      const { header } = await orgAuth();
      const res = await app.inject({
        method: 'GET',
        url: '/admin/store/orders?q=pedido-target',
        headers: { authorization: header },
      });
      const body = adminStoreOrderListResponseSchema.parse(res.json());
      expect(body.items).toHaveLength(1);
      expect(body.items[0]!.customerEmail).toBe('pedido-target@jdm.test');
    });

    it('preserves trackingCode in list after shipped → delivered transition', async () => {
      const buyer = await createUser({ email: 'track-list@jdm.test', verified: true });
      const order = await seedPaidProductOrder(buyer.user.id, {
        fulfillmentMethod: 'ship',
        fulfillmentStatus: 'packed',
      });
      const { header } = await orgAuth();

      const ship = await app.inject({
        method: 'PATCH',
        url: `/admin/store/orders/${order.id}/fulfillment`,
        headers: { authorization: header, 'content-type': 'application/json' },
        payload: { status: 'shipped', trackingCode: 'BR987654321' },
      });
      expect(ship.statusCode).toBe(200);

      const deliver = await app.inject({
        method: 'PATCH',
        url: `/admin/store/orders/${order.id}/fulfillment`,
        headers: { authorization: header, 'content-type': 'application/json' },
        payload: { status: 'delivered' },
      });
      expect(deliver.statusCode).toBe(200);

      const list = await app.inject({
        method: 'GET',
        url: '/admin/store/orders',
        headers: { authorization: header },
      });
      expect(list.statusCode).toBe(200);
      const body = adminStoreOrderListResponseSchema.parse(list.json());
      const row = body.items.find((i) => i.id === order.id);
      expect(row).toBeDefined();
      expect(row!.fulfillmentStatus).toBe('delivered');
      expect(row!.trackingCode).toBe('BR987654321');
    });

    it('rejects staff role', async () => {
      const { user } = await createUser({ email: 'staff@jdm.test', verified: true, role: 'staff' });
      const res = await app.inject({
        method: 'GET',
        url: '/admin/store/orders',
        headers: { authorization: bearer(loadEnv(), user.id, 'staff') },
      });
      expect(res.statusCode).toBe(403);
    });

    it('rejects unauthenticated requests', async () => {
      const res = await app.inject({ method: 'GET', url: '/admin/store/orders' });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /admin/store/orders/:id', () => {
    it('returns order detail with items and shipping address', async () => {
      const buyer = await createUser({ email: 'detail@jdm.test', verified: true });
      const order = await seedPaidProductOrder(buyer.user.id);
      const { header } = await orgAuth();
      const res = await app.inject({
        method: 'GET',
        url: `/admin/store/orders/${order.id}`,
        headers: { authorization: header },
      });
      expect(res.statusCode).toBe(200);
      const body = adminStoreOrderDetailSchema.parse(res.json());
      expect(body.id).toBe(order.id);
      expect(body.items).toHaveLength(1);
      expect(body.items[0]!.kind).toBe('product');
      expect(body.shippingAddress?.city).toBe('Curitiba');
      expect(body.customer.email).toBe('detail@jdm.test');
    });

    it('returns 404 for ticket-only orders', async () => {
      const buyer = await createUser({ email: 'tk@jdm.test', verified: true });
      const event = await prisma.event.create({
        data: {
          slug: 'evt-tk',
          title: 'TK',
          description: 'd',
          startsAt: new Date(Date.now() + 86_400_000),
          endsAt: new Date(Date.now() + 90_000_000),
          city: 'SP',
          stateCode: 'SP',
          type: 'meeting',
          status: 'published',
          capacity: 10,
          maxTicketsPerUser: 5,
        },
      });
      const tier = await prisma.ticketTier.create({
        data: {
          eventId: event.id,
          name: 'Geral',
          priceCents: 5000,
          quantityTotal: 10,
          sortOrder: 0,
        },
      });
      const ticketOrder = await prisma.order.create({
        data: {
          userId: buyer.user.id,
          eventId: event.id,
          tierId: tier.id,
          kind: 'ticket',
          amountCents: 5000,
          quantity: 1,
          currency: 'BRL',
          method: 'card',
          provider: 'stripe',
          status: 'paid',
          paidAt: new Date(),
        },
      });
      const { header } = await orgAuth();
      const res = await app.inject({
        method: 'GET',
        url: `/admin/store/orders/${ticketOrder.id}`,
        headers: { authorization: header },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('PATCH /admin/store/orders/:id/fulfillment', () => {
    it('transitions ship: unfulfilled → packed and writes audit', async () => {
      const buyer = await createUser({ email: 'patch@jdm.test', verified: true });
      const order = await seedPaidProductOrder(buyer.user.id, {
        fulfillmentMethod: 'ship',
        fulfillmentStatus: 'unfulfilled',
      });
      const { header } = await orgAuth();
      const res = await app.inject({
        method: 'PATCH',
        url: `/admin/store/orders/${order.id}/fulfillment`,
        headers: { authorization: header, 'content-type': 'application/json' },
        payload: { status: 'packed', note: 'embalado e pronto' },
      });
      expect(res.statusCode).toBe(200);
      const body = adminStoreOrderDetailSchema.parse(res.json());
      expect(body.fulfillmentStatus).toBe('packed');
      expect(body.history).toHaveLength(1);
      expect(body.history[0]!.action).toBe('store.order.fulfillment_update');

      const audit = await prisma.adminAudit.findFirst({
        where: { entityType: 'order', entityId: order.id },
      });
      expect(audit).not.toBeNull();
      const meta = audit!.metadata as Record<string, unknown>;
      expect(meta.from).toBe('unfulfilled');
      expect(meta.to).toBe('packed');
      expect(meta.note).toBe('embalado e pronto');
    });

    it('persists trackingCode when transitioning to shipped', async () => {
      const buyer = await createUser({ email: 'ship@jdm.test', verified: true });
      const order = await seedPaidProductOrder(buyer.user.id, {
        fulfillmentMethod: 'ship',
        fulfillmentStatus: 'packed',
      });
      const { header } = await orgAuth();
      const res = await app.inject({
        method: 'PATCH',
        url: `/admin/store/orders/${order.id}/fulfillment`,
        headers: { authorization: header, 'content-type': 'application/json' },
        payload: { status: 'shipped', trackingCode: 'BR123456789' },
      });
      expect(res.statusCode).toBe(200);
      const body = adminStoreOrderDetailSchema.parse(res.json());
      expect(body.fulfillmentStatus).toBe('shipped');
      expect(body.trackingCode).toBe('BR123456789');
    });

    it('rejects invalid transitions', async () => {
      const buyer = await createUser({ email: 'invalid@jdm.test', verified: true });
      const order = await seedPaidProductOrder(buyer.user.id, {
        fulfillmentMethod: 'ship',
        fulfillmentStatus: 'unfulfilled',
      });
      const { header } = await orgAuth();
      const res = await app.inject({
        method: 'PATCH',
        url: `/admin/store/orders/${order.id}/fulfillment`,
        headers: { authorization: header, 'content-type': 'application/json' },
        payload: { status: 'delivered' },
      });
      expect(res.statusCode).toBe(409);
    });

    it('rejects ship transitions on pickup-method orders', async () => {
      const buyer = await createUser({ email: 'pickup@jdm.test', verified: true });
      const order = await seedPaidProductOrder(buyer.user.id, {
        fulfillmentMethod: 'pickup',
        fulfillmentStatus: 'unfulfilled',
        withShippingAddress: false,
      });
      const { header } = await orgAuth();
      const res = await app.inject({
        method: 'PATCH',
        url: `/admin/store/orders/${order.id}/fulfillment`,
        headers: { authorization: header, 'content-type': 'application/json' },
        payload: { status: 'packed' },
      });
      expect(res.statusCode).toBe(409);
    });

    it('allows pickup transition: unfulfilled → pickup_ready → picked_up', async () => {
      const buyer = await createUser({ email: 'pkup@jdm.test', verified: true });
      const order = await seedPaidProductOrder(buyer.user.id, {
        fulfillmentMethod: 'pickup',
        fulfillmentStatus: 'unfulfilled',
        withShippingAddress: false,
      });
      const { header } = await orgAuth();
      const r1 = await app.inject({
        method: 'PATCH',
        url: `/admin/store/orders/${order.id}/fulfillment`,
        headers: { authorization: header, 'content-type': 'application/json' },
        payload: { status: 'pickup_ready' },
      });
      expect(r1.statusCode).toBe(200);
      const r2 = await app.inject({
        method: 'PATCH',
        url: `/admin/store/orders/${order.id}/fulfillment`,
        headers: { authorization: header, 'content-type': 'application/json' },
        payload: { status: 'picked_up' },
      });
      expect(r2.statusCode).toBe(200);
      const body = adminStoreOrderDetailSchema.parse(r2.json());
      expect(body.fulfillmentStatus).toBe('picked_up');
      expect(body.history).toHaveLength(2);
    });

    it('rejects fulfillment update on unpaid orders', async () => {
      const buyer = await createUser({ email: 'unpaid@jdm.test', verified: true });
      const order = await seedPaidProductOrder(buyer.user.id, { status: 'pending' });
      const { header } = await orgAuth();
      const res = await app.inject({
        method: 'PATCH',
        url: `/admin/store/orders/${order.id}/fulfillment`,
        headers: { authorization: header, 'content-type': 'application/json' },
        payload: { status: 'packed' },
      });
      expect(res.statusCode).toBe(409);
    });

    it('rejects requests with shipped status but no trackingCode', async () => {
      const buyer = await createUser({ email: 'notrack@jdm.test', verified: true });
      const order = await seedPaidProductOrder(buyer.user.id, {
        fulfillmentMethod: 'ship',
        fulfillmentStatus: 'packed',
      });
      const { header } = await orgAuth();
      const res = await app.inject({
        method: 'PATCH',
        url: `/admin/store/orders/${order.id}/fulfillment`,
        headers: { authorization: header, 'content-type': 'application/json' },
        payload: { status: 'shipped' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects staff role', async () => {
      const buyer = await createUser({ email: 'staff-pat@jdm.test', verified: true });
      const order = await seedPaidProductOrder(buyer.user.id);
      const { user: staffUser } = await createUser({
        email: 'staff2@jdm.test',
        verified: true,
        role: 'staff',
      });
      const res = await app.inject({
        method: 'PATCH',
        url: `/admin/store/orders/${order.id}/fulfillment`,
        headers: {
          authorization: bearer(loadEnv(), staffUser.id, 'staff'),
          'content-type': 'application/json',
        },
        payload: { status: 'packed' },
      });
      expect(res.statusCode).toBe(403);
    });
  });
});
