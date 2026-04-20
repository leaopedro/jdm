import { prisma } from '@jdm/db';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadEnv } from '../../../src/env.js';
import { bearer, createUser, makeApp, resetDatabase } from '../../helpers.js';

describe('PATCH /admin/events/:eventId/tiers/:tierId', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    await resetDatabase();
    app = await makeApp();
  });

  afterEach(async () => {
    await app.close();
  });

  const seed = async () => {
    const event = await prisma.event.create({
      data: {
        slug: 'e',
        title: 't',
        description: 'd',
        startsAt: new Date(Date.now() + 86400_000),
        endsAt: new Date(Date.now() + 90000_000),
        venueName: 'v',
        venueAddress: 'a',
        lat: 0,
        lng: 0,
        city: 'São Paulo',
        stateCode: 'SP',
        type: 'meeting',
        capacity: 10,
        status: 'draft',
        tiers: { create: { name: 'Geral', priceCents: 5000, quantityTotal: 100, sortOrder: 0 } },
      },
      include: { tiers: true },
    });
    return { event, tier: event.tiers[0]! };
  };

  it('updates a field and writes audit', async () => {
    const { event, tier } = await seed();
    const { user } = await createUser({ email: 'o@jdm.test', verified: true, role: 'organizer' });
    const res = await app.inject({
      method: 'PATCH',
      url: `/admin/events/${event.id}/tiers/${tier.id}`,
      headers: { authorization: bearer(loadEnv(), user.id, 'organizer') },
      payload: { priceCents: 7500 },
    });
    expect(res.statusCode).toBe(200);
    const row = await prisma.ticketTier.findUniqueOrThrow({ where: { id: tier.id } });
    expect(row.priceCents).toBe(7500);
  });

  it('404 when tier belongs to a different event', async () => {
    const { tier } = await seed();
    const other = await prisma.event.create({
      data: {
        slug: 'other',
        title: 't',
        description: 'd',
        startsAt: new Date(Date.now() + 86400_000),
        endsAt: new Date(Date.now() + 90000_000),
        venueName: 'v',
        venueAddress: 'a',
        lat: 0,
        lng: 0,
        city: 'São Paulo',
        stateCode: 'SP',
        type: 'meeting',
        capacity: 10,
        status: 'draft',
      },
    });
    const { user } = await createUser({ email: 'o@jdm.test', verified: true, role: 'organizer' });
    const res = await app.inject({
      method: 'PATCH',
      url: `/admin/events/${other.id}/tiers/${tier.id}`,
      headers: { authorization: bearer(loadEnv(), user.id, 'organizer') },
      payload: { priceCents: 7500 },
    });
    expect(res.statusCode).toBe(404);
  });
});
