import { prisma } from '@jdm/db';
import { adminStoreOrderDetailSchema } from '@jdm/shared/admin';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadEnv } from '../../src/env.js';
import { encryptField } from '../../src/services/crypto/field-encryption.js';
import { bearer, createUser, makeApp, resetDatabase } from '../helpers.js';

const FIELD_KEY = process.env.FIELD_ENCRYPTION_KEY!;
const WRONG_KEY = 'cd'.repeat(32);

const ensureProductType = async () =>
  prisma.productType.upsert({
    where: { name: 'Vestuario-enc' },
    update: {},
    create: { name: 'Vestuario-enc' },
  });

const seedProduct = async () => {
  const pt = await ensureProductType();
  return prisma.product.create({
    data: {
      slug: `enc-${Math.random().toString(36).slice(2, 8)}`,
      title: 'Produto Enc',
      description: 'Desc',
      basePriceCents: 5000,
      productTypeId: pt.id,
      status: 'active',
      shippingFeeCents: 0,
    },
  });
};

const seedVariant = (productId: string) =>
  prisma.variant.create({
    data: {
      productId,
      name: 'Unico',
      priceCents: 5000,
      quantityTotal: 10,
      quantitySold: 0,
      attributes: { size: 'M' },
      active: true,
    },
  });

const seedPickupOrder = async (userId: string, notes: string | null) => {
  const product = await seedProduct();
  const variant = await seedVariant(product.id);
  return prisma.order.create({
    data: {
      userId,
      kind: 'product',
      amountCents: 5000,
      quantity: 1,
      currency: 'BRL',
      method: 'card',
      provider: 'stripe',
      providerRef: `pi_${Math.random().toString(36).slice(2, 10)}`,
      fulfillmentMethod: 'pickup',
      fulfillmentStatus: 'unfulfilled',
      status: 'paid',
      paidAt: new Date(),
      notes,
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
    email: `org-enc-${Math.random().toString(36).slice(2, 8)}@jdm.test`,
    verified: true,
    role: 'organizer',
  });
  return { user, header: bearer(loadEnv(), user.id, 'organizer') };
};

describe('Order.notes field-level encryption', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await makeApp();
    await resetDatabase();
  });

  afterEach(async () => {
    await app.close();
  });

  const PICKUP_EVENT_ID = 'evt_fake_event_id_123';
  const PICKUP_TICKET_ID = 'tkt_fake_ticket_id_456';
  const NOTES_JSON = JSON.stringify({
    pickupEventId: PICKUP_EVENT_ID,
    pickupTicketId: PICKUP_TICKET_ID,
  });

  it('admin detail returns decrypted notes and extracts pickupRefs', async () => {
    const buyer = await createUser({ email: 'enc-buyer@jdm.test', verified: true });
    const encrypted = encryptField(NOTES_JSON, FIELD_KEY);
    const order = await seedPickupOrder(buyer.user.id, encrypted);
    const { header } = await orgAuth();

    const res = await app.inject({
      method: 'GET',
      url: `/admin/store/orders/${order.id}`,
      headers: { authorization: header },
    });

    expect(res.statusCode).toBe(200);
    const body = adminStoreOrderDetailSchema.parse(res.json());
    expect(body.notes).toBe(NOTES_JSON);
    expect(body.pickupEventId).toBe(PICKUP_EVENT_ID);
    expect(body.pickupTicketId).toBe(PICKUP_TICKET_ID);
  });

  it('admin detail handles plaintext notes (mixed state)', async () => {
    const buyer = await createUser({ email: 'plain-buyer@jdm.test', verified: true });
    const order = await seedPickupOrder(buyer.user.id, NOTES_JSON);
    const { header } = await orgAuth();

    const res = await app.inject({
      method: 'GET',
      url: `/admin/store/orders/${order.id}`,
      headers: { authorization: header },
    });

    expect(res.statusCode).toBe(200);
    const body = adminStoreOrderDetailSchema.parse(res.json());
    expect(body.notes).toBe(NOTES_JSON);
    expect(body.pickupEventId).toBe(PICKUP_EVENT_ID);
    expect(body.pickupTicketId).toBe(PICKUP_TICKET_ID);
  });

  it('admin detail survives undecryptable notes without 500', async () => {
    const buyer = await createUser({ email: 'bad-key-buyer@jdm.test', verified: true });
    const badEncrypted = encryptField(NOTES_JSON, WRONG_KEY);
    const order = await seedPickupOrder(buyer.user.id, badEncrypted);
    const { header } = await orgAuth();

    const res = await app.inject({
      method: 'GET',
      url: `/admin/store/orders/${order.id}`,
      headers: { authorization: header },
    });

    expect(res.statusCode).toBe(200);
    const body = adminStoreOrderDetailSchema.parse(res.json());
    // Should fall back to raw ciphertext, not crash
    expect(body.notes).toBe(badEncrypted);
    // pickupRefs should be null since notes couldn't be decrypted
    expect(body.pickupEventId).toBeNull();
    expect(body.pickupTicketId).toBeNull();
  });
});
