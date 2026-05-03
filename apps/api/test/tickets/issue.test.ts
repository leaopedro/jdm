import { prisma } from '@jdm/db';
import { beforeEach, describe, expect, it } from 'vitest';

import { loadEnv } from '../../src/env.js';
import { verifyQrCode } from '../../src/lib/qr.js';
import { verifyTicketCode } from '../../src/services/tickets/codes.js';
import { OrderNotPendingError, issueTicketForPaidOrder } from '../../src/services/tickets/issue.js';
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
      city: 'Sao Paulo',
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
      quantitySold: quantityTotal,
      sortOrder: 0,
    },
  });
  return { event, tier };
};

const createPendingOrder = async (
  userId: string,
  eventId: string,
  tierId: string,
  quantity = 1,
) => {
  return prisma.order.create({
    data: {
      userId,
      eventId,
      tierId,
      amountCents: 5000 * quantity,
      quantity,
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
    expect(result.ticketIds).toHaveLength(1);

    const reloaded = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(reloaded.status).toBe('paid');
    expect(reloaded.paidAt).not.toBeNull();

    const ticket = await prisma.ticket.findFirstOrThrow({ where: { orderId: order.id } });
    expect(ticket.status).toBe('valid');
    expect(ticket.source).toBe('purchase');
    expect(ticket.userId).toBe(user.id);
    expect(ticket.eventId).toBe(event.id);

    const code = result.code;
    expect(verifyTicketCode(code, env)).toBe(ticket.id);
  });

  it('is idempotent - calling twice returns the same issued ticket set', async () => {
    const { user } = await createUser({ verified: true });
    const { event, tier } = await seedEventAndTier();
    const order = await createPendingOrder(user.id, event.id, tier.id);

    const a = await issueTicketForPaidOrder(order.id, order.providerRef!, env);
    const b = await issueTicketForPaidOrder(order.id, order.providerRef!, env);

    expect(a.ticketIds).toEqual(b.ticketIds);
    const tickets = await prisma.ticket.findMany({ where: { orderId: order.id } });
    expect(tickets).toHaveLength(1);
  });

  it('issues N tickets atomically with per-ticket extras and car metadata', async () => {
    const { user } = await createUser({ verified: true });
    const { event, tier } = await seedEventAndTier(3);
    const [car1, car2] = await Promise.all([
      prisma.car.create({ data: { userId: user.id, make: 'Honda', model: 'Civic', year: 2020 } }),
      prisma.car.create({ data: { userId: user.id, make: 'Toyota', model: 'Supra', year: 1994 } }),
    ]);
    const order = await createPendingOrder(user.id, event.id, tier.id, 3);

    const extra1 = await prisma.ticketExtra.create({
      data: { eventId: event.id, name: 'Camiseta', priceCents: 5000 },
    });
    const extra2 = await prisma.ticketExtra.create({
      data: { eventId: event.id, name: 'Sticker Pack', priceCents: 1000 },
    });

    await prisma.orderExtra.createMany({
      data: [
        { orderId: order.id, extraId: extra1.id, quantity: 2 },
        { orderId: order.id, extraId: extra2.id, quantity: 1 },
      ],
    });

    const metadata = {
      tickets: JSON.stringify([
        { c: car1.id, p: 'ABC-1234', e: [extra1.id, extra2.id] },
        { c: car2.id, p: 'DEF-5678', e: [] },
        { e: [extra1.id] },
      ]),
    };

    const result = await issueTicketForPaidOrder(order.id, order.providerRef!, env, metadata);
    expect(result.ticketIds).toHaveLength(3);

    const tickets = await prisma.ticket.findMany({
      where: { orderId: order.id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    expect(tickets).toHaveLength(3);
    expect(tickets[0]?.carId).toBe(car1.id);
    expect(tickets[0]?.licensePlate).toBe('ABC-1234');
    expect(tickets[1]?.carId).toBe(car2.id);
    expect(tickets[1]?.licensePlate).toBe('DEF-5678');
    expect(tickets[2]?.carId).toBeNull();

    const extrasByTicket = await Promise.all(
      tickets.map((t) =>
        prisma.ticketExtraItem.findMany({
          where: { ticketId: t.id },
          orderBy: { extraId: 'asc' },
        }),
      ),
    );

    expect(extrasByTicket[0]).toHaveLength(2);
    expect(extrasByTicket[1]).toHaveLength(0);
    expect(extrasByTicket[2]).toHaveLength(1);

    for (const ticketItems of extrasByTicket) {
      for (const item of ticketItems ?? []) {
        expect(item.status).toBe('valid');
        const { kind, id } = verifyQrCode(item.code, env);
        expect(kind).toBe('e');
        expect(id).toBe(`${item.ticketId}-${item.extraId}`);
      }
    }
  });

  it('is idempotent for extras — redelivery via already-paid path does not duplicate TicketExtraItem rows', async () => {
    const { user } = await createUser({ verified: true });
    const { event, tier } = await seedEventAndTier();
    const order = await createPendingOrder(user.id, event.id, tier.id);

    const extra = await prisma.ticketExtra.create({
      data: { eventId: event.id, name: 'Poster', priceCents: 2000 },
    });
    await prisma.orderExtra.create({ data: { orderId: order.id, extraId: extra.id, quantity: 1 } });

    const metadata = { tickets: JSON.stringify([{ e: [extra.id] }]) };

    // First call: pending -> paid, creates ticket + extra item
    const first = await issueTicketForPaidOrder(order.id, order.providerRef!, env, metadata);
    // Second call: order.status === 'paid' branch (redelivery crash-recovery path)
    const second = await issueTicketForPaidOrder(order.id, order.providerRef!, env, metadata);

    expect(first.ticketId).toBe(second.ticketId);

    // Upsert in the already-paid path must be a no-op — still exactly one item
    const items = await prisma.ticketExtraItem.findMany({ where: { ticketId: first.ticketId } });
    expect(items).toHaveLength(1);
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

    const metadata = { tickets: JSON.stringify([{ e: [extra.id] }]) };

    const r1 = await issueTicketForPaidOrder(o1.id, o1.providerRef!, env, metadata);
    const r2 = await issueTicketForPaidOrder(o2.id, o2.providerRef!, env, metadata);

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
