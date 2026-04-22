import { prisma } from '@jdm/db';
import { eventDetailSchema } from '@jdm/shared/events';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { makeApp, resetDatabase } from '../helpers.js';

describe('GET /events/:slug', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    await resetDatabase();
    app = await makeApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns the published event with tiers and remaining capacity', async () => {
    const event = await prisma.event.create({
      data: {
        slug: 'encontro-sp',
        title: 'Encontro SP',
        description: 'Um belo encontro',
        startsAt: new Date(Date.now() + 86400_000),
        endsAt: new Date(Date.now() + 90000_000),
        venueName: 'Autódromo',
        venueAddress: 'Rua X, 100',
        city: 'São Paulo',
        stateCode: 'SP',
        type: 'meeting',
        status: 'published',
        capacity: 200,
        publishedAt: new Date(),
        tiers: {
          create: [
            { name: 'Geral', priceCents: 5000, quantityTotal: 100, quantitySold: 10, sortOrder: 0 },
            { name: 'VIP', priceCents: 15000, quantityTotal: 20, quantitySold: 0, sortOrder: 1 },
          ],
        },
      },
    });

    const res = await app.inject({ method: 'GET', url: `/events/${event.slug}` });
    expect(res.statusCode).toBe(200);
    const body = eventDetailSchema.parse(res.json());
    expect(body.slug).toBe('encontro-sp');
    expect(body.tiers).toHaveLength(2);
    const general = body.tiers.find((t) => t.name === 'Geral');
    expect(general?.remainingCapacity).toBe(90);
    const vip = body.tiers.find((t) => t.name === 'VIP');
    expect(vip?.remainingCapacity).toBe(20);
  });

  it('returns tiers in sortOrder', async () => {
    await prisma.event.create({
      data: {
        slug: 'sorted',
        title: 't',
        description: 'd',
        startsAt: new Date(Date.now() + 86400_000),
        endsAt: new Date(Date.now() + 90000_000),
        venueName: 'v',
        venueAddress: 'a',
        city: 'São Paulo',
        stateCode: 'SP',
        type: 'meeting',
        status: 'published',
        capacity: 10,
        publishedAt: new Date(),
        tiers: {
          create: [
            { name: 'B', priceCents: 100, quantityTotal: 5, sortOrder: 1 },
            { name: 'A', priceCents: 200, quantityTotal: 5, sortOrder: 0 },
          ],
        },
      },
    });
    const res = await app.inject({ method: 'GET', url: '/events/sorted' });
    const body = eventDetailSchema.parse(res.json());
    expect(body.tiers.map((t) => t.name)).toEqual(['A', 'B']);
  });

  it('returns 404 for unknown slug', async () => {
    const res = await app.inject({ method: 'GET', url: '/events/does-not-exist' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 for draft event (draft not publicly visible)', async () => {
    await prisma.event.create({
      data: {
        slug: 'draft-one',
        title: 't',
        description: 'd',
        startsAt: new Date(Date.now() + 86400_000),
        endsAt: new Date(Date.now() + 90000_000),
        venueName: 'v',
        venueAddress: 'a',
        city: 'São Paulo',
        stateCode: 'SP',
        type: 'meeting',
        status: 'draft',
        capacity: 10,
      },
    });
    const res = await app.inject({ method: 'GET', url: '/events/draft-one' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 for cancelled event', async () => {
    await prisma.event.create({
      data: {
        slug: 'cancelled-one',
        title: 't',
        description: 'd',
        startsAt: new Date(Date.now() + 86400_000),
        endsAt: new Date(Date.now() + 90000_000),
        venueName: 'v',
        venueAddress: 'a',
        city: 'São Paulo',
        stateCode: 'SP',
        type: 'meeting',
        status: 'cancelled',
        capacity: 10,
      },
    });
    const res = await app.inject({ method: 'GET', url: '/events/cancelled-one' });
    expect(res.statusCode).toBe(404);
  });
});
