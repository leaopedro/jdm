import { prisma } from '@jdm/db';
import { beforeEach, describe, expect, it } from 'vitest';

import { loadEnv } from '../../src/env.js';
import { settlePaidOrder } from '../../src/services/orders/settle.js';
import { createUser, resetDatabase } from '../helpers.js';

const env = loadEnv();

describe('settlePaidOrder for pickup product orders', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('binds a paid pickup product order to the buyer ticket and marks it pickup_ready', async () => {
    const { user } = await createUser({ verified: true });
    const event = await prisma.event.create({
      data: {
        slug: `pickup-${Math.random().toString(36).slice(2, 8)}`,
        title: 'Evento com retirada',
        description: 'd',
        startsAt: new Date(Date.now() + 86_400_000),
        endsAt: new Date(Date.now() + 90_000_000),
        type: 'meeting',
        status: 'published',
        capacity: 50,
        maxTicketsPerUser: 2,
        publishedAt: new Date(),
      },
    });
    const tier = await prisma.ticketTier.create({
      data: {
        eventId: event.id,
        name: 'Geral',
        priceCents: 5000,
        quantityTotal: 50,
      },
    });
    const ticket = await prisma.ticket.create({
      data: {
        userId: user.id,
        eventId: event.id,
        tierId: tier.id,
        source: 'purchase',
        status: 'valid',
      },
    });
    const productType = await prisma.productType.create({
      data: { name: `Tipo ${Math.random().toString(36).slice(2, 6)}` },
    });
    const product = await prisma.product.create({
      data: {
        slug: `moleton-${Math.random().toString(36).slice(2, 8)}`,
        title: 'Moletom',
        description: 'd',
        productTypeId: productType.id,
        basePriceCents: 15_000,
        currency: 'BRL',
        status: 'active',
      },
    });
    const variant = await prisma.variant.create({
      data: {
        productId: product.id,
        name: 'Chumbo M',
        sku: 'MOQ-M',
        priceCents: 15_000,
        quantityTotal: 10,
        quantitySold: 1,
        attributes: { size: 'M', color: 'Chumbo' },
        active: true,
      },
    });
    const order = await prisma.order.create({
      data: {
        userId: user.id,
        kind: 'product',
        amountCents: 15_000,
        quantity: 1,
        method: 'card',
        provider: 'stripe',
        status: 'pending',
        fulfillmentMethod: 'pickup',
        notes: JSON.stringify({
          pickup: {
            eventId: event.id,
            ticketId: null,
            pickedUpAt: null,
            pickedUpBy: null,
          },
        }),
      },
    });
    await prisma.orderItem.create({
      data: {
        orderId: order.id,
        kind: 'product',
        variantId: variant.id,
        quantity: 1,
        unitPriceCents: 15_000,
        subtotalCents: 15_000,
      },
    });

    const settled = await settlePaidOrder(order.id, 'pi_pickup_1', env);

    expect(settled.kind).toBe('product');
    const orderAfter = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(orderAfter.status).toBe('paid');
    expect(orderAfter.paidAt).not.toBeNull();
    expect(orderAfter.fulfillmentStatus).toBe('pickup_ready');

    const note = JSON.parse(orderAfter.notes ?? '{}') as {
      pickup?: { eventId?: string; ticketId?: string | null };
    };
    expect(note.pickup?.eventId).toBe(event.id);
    expect(note.pickup?.ticketId).toBe(ticket.id);
  });
});
