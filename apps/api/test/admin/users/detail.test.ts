import { prisma } from '@jdm/db';
import type { AdminUserDetail } from '@jdm/shared/admin';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadEnv } from '../../../src/env.js';
import { bearer, createUser, makeApp, resetDatabase } from '../../helpers.js';

const json = (res: { json: () => unknown }) => res.json() as AdminUserDetail;

const mkEvent = (slug = 'ev-detail') =>
  prisma.event.create({
    data: {
      slug,
      title: 'Detail Event',
      description: 'd',
      startsAt: new Date(Date.now() + 86400_000),
      endsAt: new Date(Date.now() + 90000_000),
      venueName: 'v',
      venueAddress: 'a',
      city: 'São Paulo',
      stateCode: 'SP',
      type: 'meeting',
      capacity: 100,
      status: 'published',
    },
  });

const mkTier = (eventId: string, name = 'Geral') =>
  prisma.ticketTier.create({
    data: { eventId, name, priceCents: 5000, currency: 'BRL', quantityTotal: 50 },
  });

describe('GET /admin/users/:id', () => {
  let app: FastifyInstance;
  const env = () => loadEnv();

  beforeEach(async () => {
    await resetDatabase();
    app = await makeApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin/users/any' });
    expect(res.statusCode).toBe(401);
  });

  it('403 for user role', async () => {
    const { user } = await createUser({ email: 'u@test.com', verified: true, role: 'user' });
    const res = await app.inject({
      method: 'GET',
      url: `/admin/users/${user.id}`,
      headers: { authorization: bearer(env(), user.id, 'user') },
    });
    expect(res.statusCode).toBe(403);
  });

  it('404 for unknown user', async () => {
    const { user: org } = await createUser({
      email: 'o@test.com',
      verified: true,
      role: 'organizer',
    });
    const res = await app.inject({
      method: 'GET',
      url: '/admin/users/nonexistent',
      headers: { authorization: bearer(env(), org.id, 'organizer') },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns user profile with stats and empty recents', async () => {
    const { user: org } = await createUser({
      email: 'o@test.com',
      verified: true,
      role: 'organizer',
    });
    const { user: target } = await createUser({
      email: 'target@test.com',
      name: 'Target User',
      verified: true,
    });

    const res = await app.inject({
      method: 'GET',
      url: `/admin/users/${target.id}`,
      headers: { authorization: bearer(env(), org.id, 'organizer') },
    });
    expect(res.statusCode).toBe(200);
    const body = json(res);
    expect(body.id).toBe(target.id);
    expect(body.name).toBe('Target User');
    expect(body.email).toBe('target@test.com');
    expect(body.role).toBe('user');
    expect(body.avatarUrl).toBeNull();
    expect(body.createdAt).toBeDefined();
    expect(body.stats).toEqual({ totalTickets: 0, totalOrders: 0 });
    expect(body.recentTickets).toEqual([]);
    expect(body.recentOrders).toEqual([]);
  });

  it('returns correct stats and recent tickets/orders', async () => {
    const { user: org } = await createUser({
      email: 'o@test.com',
      verified: true,
      role: 'organizer',
    });
    const { user: target } = await createUser({
      email: 'target@test.com',
      name: 'Target',
      verified: true,
    });

    const event = await mkEvent();
    const tier = await mkTier(event.id);

    const order = await prisma.order.create({
      data: {
        userId: target.id,
        eventId: event.id,
        tierId: tier.id,
        amountCents: 5000,
        currency: 'BRL',
        method: 'card',
        provider: 'stripe',
        status: 'paid',
        paidAt: new Date(),
      },
    });

    await prisma.ticket.create({
      data: {
        userId: target.id,
        eventId: event.id,
        tierId: tier.id,
        orderId: order.id,
        source: 'purchase',
        status: 'valid',
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/admin/users/${target.id}`,
      headers: { authorization: bearer(env(), org.id, 'organizer') },
    });
    expect(res.statusCode).toBe(200);
    const body = json(res);
    expect(body.stats.totalTickets).toBe(1);
    expect(body.stats.totalOrders).toBe(1);
    expect(body.recentTickets).toHaveLength(1);
    expect(body.recentTickets[0]!.eventTitle).toBe('Detail Event');
    expect(body.recentTickets[0]!.tierName).toBe('Geral');
    expect(body.recentTickets[0]!.status).toBe('valid');
    expect(body.recentTickets[0]!.source).toBe('purchase');
    expect(body.recentOrders).toHaveLength(1);
    expect(body.recentOrders[0]!.eventTitle).toBe('Detail Event');
    expect(body.recentOrders[0]!.tierName).toBe('Geral');
    expect(body.recentOrders[0]!.amountCents).toBe(5000);
    expect(body.recentOrders[0]!.status).toBe('paid');
  });

  it('limits recent items to 5', async () => {
    const { user: org } = await createUser({
      email: 'o@test.com',
      verified: true,
      role: 'organizer',
    });
    const { user: target } = await createUser({
      email: 'target@test.com',
      name: 'Target',
      verified: true,
    });

    const events = await Promise.all(Array.from({ length: 7 }, (_, i) => mkEvent(`ev-${i}`)));

    for (const event of events) {
      const tier = await mkTier(event.id, `Tier-${event.slug}`);
      await prisma.ticket.create({
        data: {
          userId: target.id,
          eventId: event.id,
          tierId: tier.id,
          source: 'purchase',
          status: 'valid',
        },
      });
      await prisma.order.create({
        data: {
          userId: target.id,
          eventId: event.id,
          tierId: tier.id,
          amountCents: 1000,
          currency: 'BRL',
          method: 'card',
          provider: 'stripe',
          status: 'paid',
          paidAt: new Date(),
        },
      });
    }

    const res = await app.inject({
      method: 'GET',
      url: `/admin/users/${target.id}`,
      headers: { authorization: bearer(env(), org.id, 'organizer') },
    });
    expect(res.statusCode).toBe(200);
    const body = json(res);
    expect(body.stats.totalTickets).toBe(7);
    expect(body.stats.totalOrders).toBe(7);
    expect(body.recentTickets).toHaveLength(5);
    expect(body.recentOrders).toHaveLength(5);
  });
});
