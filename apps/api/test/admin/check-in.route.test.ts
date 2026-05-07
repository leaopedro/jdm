import { prisma } from '@jdm/db';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadEnv } from '../../src/env.js';
import { signTicketCode } from '../../src/services/tickets/codes.js';
import { bearer, createUser, makeApp, resetDatabase } from '../helpers.js';

const env = loadEnv();

const seedTicket = async (status: 'valid' | 'used' | 'revoked' = 'valid') => {
  const { user: holder } = await createUser({
    email: `h-${Math.random()}@jdm.test`,
    verified: true,
  });
  const event = await prisma.event.create({
    data: {
      slug: `ev-${Math.random().toString(36).slice(2, 8)}`,
      title: 'Test Event',
      description: 'd',
      startsAt: new Date(Date.now() + 3600_000),
      endsAt: new Date(Date.now() + 7200_000),
      venueName: 'V',
      venueAddress: 'A',
      city: 'SP',
      stateCode: 'SP',
      type: 'meeting',
      status: 'published',
      publishedAt: new Date(),
      capacity: 10,
    },
  });
  const tier = await prisma.ticketTier.create({
    data: {
      eventId: event.id,
      name: 'GA',
      priceCents: 1000,
      quantityTotal: 10,
      quantitySold: 1,
      sortOrder: 0,
    },
  });
  const ticket = await prisma.ticket.create({
    data: {
      userId: holder.id,
      eventId: event.id,
      tierId: tier.id,
      status,
      usedAt: status === 'used' ? new Date(Date.now() - 60_000) : null,
      source: 'purchase',
    },
  });
  return { holder, event, tier, ticket, code: signTicketCode(ticket.id, env) };
};

const seedPickupOrderForTicket = async (
  ticket: { id: string; userId: string; eventId: string },
  opts?: {
    status?: 'pending' | 'paid';
    fulfillmentStatus?: 'unfulfilled' | 'pickup_ready' | 'picked_up';
  },
) => {
  const productType = await prisma.productType.create({
    data: { name: `Tipo ${Math.random().toString(36).slice(2, 6)}` },
  });
  const product = await prisma.product.create({
    data: {
      slug: `produto-${Math.random().toString(36).slice(2, 8)}`,
      title: 'Moletom JDM',
      description: 'Colecao limitada',
      productTypeId: productType.id,
      basePriceCents: 12_000,
      currency: 'BRL',
      status: 'active',
    },
  });
  const variant = await prisma.variant.create({
    data: {
      productId: product.id,
      name: 'Preto G',
      sku: 'JDM-HOODIE-G',
      priceCents: 12_000,
      quantityTotal: 10,
      quantitySold: 1,
      attributes: { size: 'G', color: 'Preto' },
      active: true,
    },
  });
  const order = await prisma.order.create({
    data: {
      userId: ticket.userId,
      kind: 'product',
      amountCents: 24_000,
      quantity: 2,
      method: 'card',
      provider: 'stripe',
      status: opts?.status ?? 'paid',
      paidAt: opts?.status === 'pending' ? null : new Date(),
      fulfillmentMethod: 'pickup',
      fulfillmentStatus: opts?.fulfillmentStatus ?? 'pickup_ready',
      notes: JSON.stringify({
        pickup: {
          eventId: ticket.eventId,
          ticketId: ticket.id,
          pickedUpAt: opts?.fulfillmentStatus === 'picked_up' ? new Date().toISOString() : null,
          pickedUpBy: opts?.fulfillmentStatus === 'picked_up' ? 'staff-existing' : null,
        },
      }),
    },
  });
  await prisma.orderItem.create({
    data: {
      orderId: order.id,
      kind: 'product',
      variantId: variant.id,
      quantity: 2,
      unitPriceCents: 12_000,
      subtotalCents: 24_000,
    },
  });

  return { order, product, variant };
};

describe('POST /admin/tickets/check-in', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    await resetDatabase();
    app = await makeApp();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('401 without auth', async () => {
    const { event, code } = await seedTicket();
    const res = await app.inject({
      method: 'POST',
      url: '/admin/tickets/check-in',
      payload: { code, eventId: event.id },
    });
    expect(res.statusCode).toBe(401);
  });

  it('403 for regular user role', async () => {
    const { event, code } = await seedTicket();
    const { user } = await createUser({ email: 'u@jdm.test', verified: true, role: 'user' });
    const res = await app.inject({
      method: 'POST',
      url: '/admin/tickets/check-in',
      headers: { authorization: bearer(env, user.id, 'user') },
      payload: { code, eventId: event.id },
    });
    expect(res.statusCode).toBe(403);
  });

  it.each(['staff', 'organizer', 'admin'] as const)('200 admitted for %s', async (role) => {
    const { event, code, holder, tier } = await seedTicket();
    const { user: actor } = await createUser({
      email: `a-${role}@jdm.test`,
      verified: true,
      role,
    });
    const res = await app.inject({
      method: 'POST',
      url: '/admin/tickets/check-in',
      headers: { authorization: bearer(env, actor.id, role) },
      payload: { code, eventId: event.id },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      result: string;
      ticket: { id: string; status: string; tier: { name: string }; holder: { name: string } };
    }>();
    expect(body.result).toBe('admitted');
    expect(body.ticket.status).toBe('used');
    expect(body.ticket.tier.name).toBe(tier.name);
    expect(body.ticket.holder.name).toBe(holder.name);
  });

  it('writes a ticket.check_in audit row on admit (once)', async () => {
    const { event, code, ticket } = await seedTicket();
    const { user: actor } = await createUser({
      email: 'a-audit@jdm.test',
      verified: true,
      role: 'staff',
    });
    await app.inject({
      method: 'POST',
      url: '/admin/tickets/check-in',
      headers: { authorization: bearer(env, actor.id, 'staff') },
      payload: { code, eventId: event.id },
    });
    const rows = await prisma.adminAudit.findMany({ where: { action: 'ticket.check_in' } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.actorId).toBe(actor.id);
    expect(rows[0]!.entityType).toBe('ticket');
    expect(rows[0]!.entityId).toBe(ticket.id);
    expect(rows[0]!.metadata).toEqual({ eventId: event.id });
  });

  it('idempotent: already_used on second call does NOT write a second audit row', async () => {
    const { event, code } = await seedTicket();
    const { user: actor } = await createUser({
      email: 'a-idem@jdm.test',
      verified: true,
      role: 'staff',
    });
    const auth = { authorization: bearer(env, actor.id, 'staff') };
    await app.inject({
      method: 'POST',
      url: '/admin/tickets/check-in',
      headers: auth,
      payload: { code, eventId: event.id },
    });
    const res2 = await app.inject({
      method: 'POST',
      url: '/admin/tickets/check-in',
      headers: auth,
      payload: { code, eventId: event.id },
    });
    expect(res2.statusCode).toBe(200);
    expect(res2.json<{ result: string }>().result).toBe('already_used');
    const rows = await prisma.adminAudit.findMany({ where: { action: 'ticket.check_in' } });
    expect(rows).toHaveLength(1);
  });

  it('400 on malformed code', async () => {
    const { event } = await seedTicket();
    const { user: actor } = await createUser({
      email: 'a-bad@jdm.test',
      verified: true,
      role: 'staff',
    });
    const res = await app.inject({
      method: 'POST',
      url: '/admin/tickets/check-in',
      headers: { authorization: bearer(env, actor.id, 'staff') },
      payload: { code: 'definitely-bogus-payload', eventId: event.id },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: string }>().error).toBe('InvalidTicketCode');
  });

  it('404 when the signed ticket does not exist', async () => {
    const { event } = await seedTicket();
    const orphan = signTicketCode('orphan-id', env);
    const { user: actor } = await createUser({
      email: 'a-orphan@jdm.test',
      verified: true,
      role: 'staff',
    });
    const res = await app.inject({
      method: 'POST',
      url: '/admin/tickets/check-in',
      headers: { authorization: bearer(env, actor.id, 'staff') },
      payload: { code: orphan, eventId: event.id },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json<{ error: string }>().error).toBe('TicketNotFound');
  });

  it('409 for wrong-event', async () => {
    const { code } = await seedTicket();
    const other = await prisma.event.create({
      data: {
        slug: 'wrong-ev',
        title: 'Other',
        description: 'd',
        startsAt: new Date(Date.now() + 3600_000),
        endsAt: new Date(Date.now() + 7200_000),
        venueName: 'V',
        venueAddress: 'A',
        city: 'RJ',
        stateCode: 'RJ',
        type: 'meeting',
        status: 'published',
        publishedAt: new Date(),
        capacity: 10,
      },
    });
    const { user: actor } = await createUser({
      email: 'a-wrong@jdm.test',
      verified: true,
      role: 'staff',
    });
    const res = await app.inject({
      method: 'POST',
      url: '/admin/tickets/check-in',
      headers: { authorization: bearer(env, actor.id, 'staff') },
      payload: { code, eventId: other.id },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json<{ error: string }>().error).toBe('TicketWrongEvent');
  });

  it('409 for revoked ticket', async () => {
    const { event, code } = await seedTicket('revoked');
    const { user: actor } = await createUser({
      email: 'a-rev@jdm.test',
      verified: true,
      role: 'staff',
    });
    const res = await app.inject({
      method: 'POST',
      url: '/admin/tickets/check-in',
      headers: { authorization: bearer(env, actor.id, 'staff') },
      payload: { code, eventId: event.id },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json<{ error: string }>().error).toBe('TicketRevoked');
  });

  it('claims assigned pickup orders from ticket QR without consuming the ticket', async () => {
    const { event, code, holder, tier, ticket } = await seedTicket();
    const { order, product, variant } = await seedPickupOrderForTicket(ticket);
    const { user: actor } = await createUser({
      email: 'pickup-staff@jdm.test',
      verified: true,
      role: 'staff',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/admin/tickets/pickup',
      headers: { authorization: bearer(env, actor.id, 'staff') },
      payload: { code, eventId: event.id },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{
      result: string;
      ticket: {
        id: string;
        status: string;
        checkedInAt: string | null;
        tier: { name: string };
        holder: { name: string };
      };
      pickups: Array<{
        orderId: string;
        fulfillmentStatus: string;
        pickedUpAt: string | null;
        items: Array<{
          productTitle: string;
          variantName: string;
          variantSku: string | null;
          quantity: number;
          attributes: Record<string, unknown> | null;
        }>;
      }>;
    }>();
    expect(body.result).toBe('claimed');
    expect(body.ticket.id).toBe(ticket.id);
    expect(body.ticket.status).toBe('valid');
    expect(body.ticket.checkedInAt).toBeNull();
    expect(body.ticket.tier.name).toBe(tier.name);
    expect(body.ticket.holder.name).toBe(holder.name);
    expect(body.pickups).toHaveLength(1);
    expect(body.pickups[0]!.orderId).toBe(order.id);
    expect(body.pickups[0]!.fulfillmentStatus).toBe('picked_up');
    expect(body.pickups[0]!.items).toHaveLength(1);
    expect(body.pickups[0]!.items[0]!.productTitle).toBe(product.title);
    expect(body.pickups[0]!.items[0]!.variantName).toBe(variant.name);
    expect(body.pickups[0]!.items[0]!.variantSku).toBe(variant.sku);
    expect(body.pickups[0]!.items[0]!.quantity).toBe(2);
    expect(body.pickups[0]!.items[0]!.attributes).toEqual({ size: 'G', color: 'Preto' });

    const orderAfter = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(orderAfter.fulfillmentStatus).toBe('picked_up');
    const ticketAfter = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(ticketAfter.status).toBe('valid');
  });

  it('pickup scan is idempotent on duplicate scans', async () => {
    const { event, code, ticket } = await seedTicket();
    await seedPickupOrderForTicket(ticket, { fulfillmentStatus: 'picked_up' });
    const { user: actor } = await createUser({
      email: 'pickup-retry@jdm.test',
      verified: true,
      role: 'staff',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/admin/tickets/pickup',
      headers: { authorization: bearer(env, actor.id, 'staff') },
      payload: { code, eventId: event.id },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ result: string; pickups: Array<{ fulfillmentStatus: string }> }>();
    expect(body.result).toBe('already_used');
    expect(body.pickups[0]!.fulfillmentStatus).toBe('picked_up');
  });

  it('does not expose unpaid pickup intent as a claimable entitlement', async () => {
    const { event, code, ticket } = await seedTicket();
    await seedPickupOrderForTicket(ticket, {
      status: 'pending',
      fulfillmentStatus: 'unfulfilled',
    });
    const { user: actor } = await createUser({
      email: 'pickup-pending@jdm.test',
      verified: true,
      role: 'staff',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/admin/tickets/pickup',
      headers: { authorization: bearer(env, actor.id, 'staff') },
      payload: { code, eventId: event.id },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json<{ error: string }>().error).toBe('PickupEntitlementNotFound');
  });
});
