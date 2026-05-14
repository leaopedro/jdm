import { prisma } from '@jdm/db';
import { beforeEach, describe, expect, it } from 'vitest';

import { revokeTicketsForRefundedOrder } from '../../src/services/orders/revoke.js';
import { createUser, resetDatabase } from '../helpers.js';

const seedPaidOrderWithTicket = async (userId: string) => {
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
      capacity: 5,
      maxTicketsPerUser: 1,
      publishedAt: new Date(),
    },
  });
  const tier = await prisma.ticketTier.create({
    data: {
      eventId: event.id,
      name: 'Geral',
      priceCents: 5000,
      quantityTotal: 5,
      quantitySold: 1,
      sortOrder: 0,
    },
  });
  const extra = await prisma.ticketExtra.create({
    data: {
      eventId: event.id,
      name: 'Estacionamento',
      priceCents: 2000,
      quantitySold: 1,
      sortOrder: 0,
    },
  });
  const order = await prisma.order.create({
    data: {
      userId,
      eventId: event.id,
      tierId: tier.id,
      amountCents: 7000,
      quantity: 1,
      method: 'card',
      provider: 'stripe',
      providerRef: 'pi_test_revoke',
      status: 'paid',
      paidAt: new Date(),
    },
  });
  await prisma.orderExtra.create({
    data: { orderId: order.id, extraId: extra.id, quantity: 1 },
  });
  const ticket = await prisma.ticket.create({
    data: {
      orderId: order.id,
      userId,
      eventId: event.id,
      tierId: tier.id,
      source: 'purchase',
      status: 'valid',
    },
  });
  const extraItem = await prisma.ticketExtraItem.create({
    data: {
      ticketId: ticket.id,
      extraId: extra.id,
      code: `extra_${ticket.id}_${extra.id}.hmac`,
      status: 'valid',
    },
  });
  return { event, tier, extra, order, ticket, extraItem };
};

describe('revokeTicketsForRefundedOrder', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('revokes ticket and extra items for a refunded order', async () => {
    const { user } = await createUser();
    const { order, ticket, extraItem } = await seedPaidOrderWithTicket(user.id);

    await revokeTicketsForRefundedOrder(order.id);

    const updatedTicket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(updatedTicket.status).toBe('revoked');

    const updatedExtraItem = await prisma.ticketExtraItem.findUniqueOrThrow({
      where: { id: extraItem.id },
    });
    expect(updatedExtraItem.status).toBe('revoked');
  });

  it('is idempotent - calling twice does not throw', async () => {
    const { user } = await createUser();
    const { order } = await seedPaidOrderWithTicket(user.id);

    await revokeTicketsForRefundedOrder(order.id);
    await revokeTicketsForRefundedOrder(order.id);

    const tickets = await prisma.ticket.findMany({ where: { orderId: order.id } });
    expect(tickets).toHaveLength(1);
    expect(tickets[0]!.status).toBe('revoked');
  });

  it('does nothing when order has no tickets', async () => {
    const { user } = await createUser();
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
        capacity: 5,
        maxTicketsPerUser: 1,
        publishedAt: new Date(),
      },
    });
    const tier = await prisma.ticketTier.create({
      data: {
        eventId: event.id,
        name: 'Geral',
        priceCents: 5000,
        quantityTotal: 5,
        quantitySold: 0,
        sortOrder: 0,
      },
    });
    const order = await prisma.order.create({
      data: {
        userId: user.id,
        eventId: event.id,
        tierId: tier.id,
        amountCents: 5000,
        quantity: 1,
        method: 'card',
        provider: 'stripe',
        providerRef: 'pi_no_ticket',
        status: 'paid',
        paidAt: new Date(),
      },
    });

    await expect(revokeTicketsForRefundedOrder(order.id)).resolves.not.toThrow();
  });
});
