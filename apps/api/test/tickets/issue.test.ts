import { prisma } from '@jdm/db';
import { beforeEach, describe, expect, it } from 'vitest';

import { loadEnv } from '../../src/env.js';
import { verifyQrCode } from '../../src/lib/qr.js';
import { verifyTicketCode } from '../../src/services/tickets/codes.js';
import {
  OrderNotPendingError,
  TicketAlreadyExistsForEventError,
  issueTicketForPaidOrder,
} from '../../src/services/tickets/issue.js';
import { createUser, resetDatabase } from '../helpers.js';

const env = loadEnv();

const seedEventAndTier = async (quantityTotal = 1) => {
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
      quantitySold: 1,
      sortOrder: 0,
    },
  });
  return { event, tier };
};

const createPendingOrder = async (userId: string, eventId: string, tierId: string) => {
  return prisma.order.create({
    data: {
      userId,
      eventId,
      tierId,
      amountCents: 5000,
      method: 'card',
      provider: 'stripe',
      providerRef: `pi_test_${Math.random().toString(36).slice(2, 10)}`,
      status: 'pending',
    },
  });
};

describe('issueTicketForPaidOrder', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('marks order paid and issues a ticket with a valid signed code', async () => {
    const { user } = await createUser({ verified: true });
    const { event, tier } = await seedEventAndTier();
    const order = await createPendingOrder(user.id, event.id, tier.id);

    const result = await issueTicketForPaidOrder(order.id, order.providerRef!, env);
    expect(result.ticketId).toBeTruthy();

    const reloaded = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(reloaded.status).toBe('paid');
    expect(reloaded.paidAt).not.toBeNull();

    const ticket = await prisma.ticket.findUniqueOrThrow({
      where: { orderId: order.id },
    });
    expect(ticket.status).toBe('valid');
    expect(ticket.source).toBe('purchase');
    expect(ticket.userId).toBe(user.id);
    expect(ticket.eventId).toBe(event.id);

    const code = result.code;
    expect(verifyTicketCode(code, env)).toBe(ticket.id);
  });

  it('is idempotent - calling twice returns the same ticket', async () => {
    const { user } = await createUser({ verified: true });
    const { event, tier } = await seedEventAndTier();
    const order = await createPendingOrder(user.id, event.id, tier.id);

    const a = await issueTicketForPaidOrder(order.id, order.providerRef!, env);
    const b = await issueTicketForPaidOrder(order.id, order.providerRef!, env);

    expect(a.ticketId).toBe(b.ticketId);
    const tickets = await prisma.ticket.findMany({ where: { userId: user.id } });
    expect(tickets).toHaveLength(1);
  });

  it('throws if order is already failed (webhook ordering bug)', async () => {
    const { user } = await createUser({ verified: true });
    const { event, tier } = await seedEventAndTier();
    const order = await prisma.order.create({
      data: {
        userId: user.id,
        eventId: event.id,
        tierId: tier.id,
        amountCents: 5000,
        method: 'card',
        provider: 'stripe',
        providerRef: 'pi_test_failed',
        status: 'failed',
        failedAt: new Date(),
      },
    });
    await expect(issueTicketForPaidOrder(order.id, 'pi_test_failed', env)).rejects.toThrow(
      OrderNotPendingError,
    );
  });

  it('throws if user already has a ticket for this event (premium-grant race, future F8)', async () => {
    const { user } = await createUser({ verified: true });
    const { event, tier } = await seedEventAndTier(2);
    await prisma.ticket.create({
      data: {
        userId: user.id,
        eventId: event.id,
        tierId: tier.id,
        source: 'comp',
        status: 'valid',
      },
    });
    const order = await createPendingOrder(user.id, event.id, tier.id);

    await expect(issueTicketForPaidOrder(order.id, order.providerRef!, env)).rejects.toThrow(
      TicketAlreadyExistsForEventError,
    );

    const reloaded = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(reloaded.status).toBe('pending');
  });

  it('creates TicketExtraItem rows for each extra in the order', async () => {
    const { user } = await createUser({ verified: true });
    const { event, tier } = await seedEventAndTier();
    const order = await createPendingOrder(user.id, event.id, tier.id);

    const extra1 = await prisma.ticketExtra.create({
      data: { eventId: event.id, name: 'Camiseta', priceCents: 5000 },
    });
    const extra2 = await prisma.ticketExtra.create({
      data: { eventId: event.id, name: 'Sticker Pack', priceCents: 1000 },
    });
    await prisma.orderExtra.createMany({
      data: [
        { orderId: order.id, extraId: extra1.id, quantity: 1 },
        { orderId: order.id, extraId: extra2.id, quantity: 1 },
      ],
    });

    const result = await issueTicketForPaidOrder(order.id, order.providerRef!, env);

    const items = await prisma.ticketExtraItem.findMany({
      where: { ticketId: result.ticketId },
      orderBy: { extraId: 'asc' },
    });
    expect(items).toHaveLength(2);

    for (const item of items) {
      expect(item.status).toBe('valid');
      const { kind, id } = verifyQrCode(item.code, env);
      expect(kind).toBe('e');
      expect(id).toBe(`${result.ticketId}-${item.extraId}`);
    }

    const extraIds = items.map((i) => i.extraId).sort();
    expect(extraIds).toEqual([extra1.id, extra2.id].sort());
  });

  it('is idempotent for extras — redelivery does not create duplicate TicketExtraItem rows', async () => {
    const { user } = await createUser({ verified: true });
    const { event, tier } = await seedEventAndTier();
    const order = await createPendingOrder(user.id, event.id, tier.id);

    const extra = await prisma.ticketExtra.create({
      data: { eventId: event.id, name: 'Pôster', priceCents: 2000 },
    });
    await prisma.orderExtra.create({ data: { orderId: order.id, extraId: extra.id, quantity: 1 } });

    const first = await issueTicketForPaidOrder(order.id, order.providerRef!, env);
    const second = await issueTicketForPaidOrder(order.id, order.providerRef!, env);

    expect(first.ticketId).toBe(second.ticketId);

    const items = await prisma.ticketExtraItem.findMany({ where: { ticketId: first.ticketId } });
    expect(items).toHaveLength(1);
  });

  it('creates no TicketExtraItem rows when the order has no extras', async () => {
    const { user } = await createUser({ verified: true });
    const { event, tier } = await seedEventAndTier();
    const order = await createPendingOrder(user.id, event.id, tier.id);

    const result = await issueTicketForPaidOrder(order.id, order.providerRef!, env);

    const items = await prisma.ticketExtraItem.findMany({ where: { ticketId: result.ticketId } });
    expect(items).toHaveLength(0);
  });

  it('extra item codes are unique across two different orders with the same extra', async () => {
    const { user: u1 } = await createUser({ verified: true, email: 'buyer1@jdm.test' });
    const { user: u2 } = await createUser({ verified: true, email: 'buyer2@jdm.test' });
    const { event, tier } = await seedEventAndTier(5);
    const o1 = await createPendingOrder(u1.id, event.id, tier.id);
    const o2 = await createPendingOrder(u2.id, event.id, tier.id);

    const extra = await prisma.ticketExtra.create({
      data: { eventId: event.id, name: 'Exclusivo', priceCents: 3000 },
    });
    await prisma.orderExtra.create({ data: { orderId: o1.id, extraId: extra.id, quantity: 1 } });
    await prisma.orderExtra.create({ data: { orderId: o2.id, extraId: extra.id, quantity: 1 } });

    const r1 = await issueTicketForPaidOrder(o1.id, o1.providerRef!, env);
    const r2 = await issueTicketForPaidOrder(o2.id, o2.providerRef!, env);

    const item1 = await prisma.ticketExtraItem.findFirstOrThrow({
      where: { ticketId: r1.ticketId },
    });
    const item2 = await prisma.ticketExtraItem.findFirstOrThrow({
      where: { ticketId: r2.ticketId },
    });

    expect(item1.code).not.toBe(item2.code);
    expect(item1.ticketId).not.toBe(item2.ticketId);
  });
});
