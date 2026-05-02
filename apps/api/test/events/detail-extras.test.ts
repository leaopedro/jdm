import { prisma } from '@jdm/db';
import { eventDetailSchema } from '@jdm/shared/events';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { makeApp, resetDatabase } from '../helpers.js';

const makePublishedEvent = (slug: string) =>
  prisma.event.create({
    data: {
      slug,
      title: 'Test Event',
      description: 'desc',
      startsAt: new Date(Date.now() + 86400_000),
      endsAt: new Date(Date.now() + 90000_000),
      venueName: 'Local',
      venueAddress: 'Rua A, 1',
      city: 'São Paulo',
      stateCode: 'SP',
      type: 'meeting',
      status: 'published',
      capacity: 100,
      publishedAt: new Date(),
      tiers: {
        create: [{ name: 'Geral', priceCents: 5000, quantityTotal: 100, sortOrder: 0 }],
      },
    },
  });

describe('GET /events/:slug — extras payload', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    await resetDatabase();
    app = await makeApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('includes active extras with computed quantityRemaining', async () => {
    const event = await makePublishedEvent('extras-test');
    await prisma.ticketExtra.create({
      data: {
        eventId: event.id,
        name: 'Camiseta Evento',
        description: 'Camiseta exclusiva',
        priceCents: 4000,
        quantityTotal: 50,
        quantitySold: 12,
        sortOrder: 0,
      },
    });

    const res = await app.inject({ method: 'GET', url: `/events/${event.slug}` });
    expect(res.statusCode).toBe(200);
    const body = eventDetailSchema.parse(res.json());
    expect(body.extras).toHaveLength(1);
    expect(body.extras[0]).toMatchObject({
      name: 'Camiseta Evento',
      description: 'Camiseta exclusiva',
      priceCents: 4000,
      currency: 'BRL',
      quantityRemaining: 38,
      sortOrder: 0,
    });
  });

  it('hides inactive extras', async () => {
    const event = await makePublishedEvent('inactive-extras');
    await prisma.ticketExtra.createMany({
      data: [
        {
          eventId: event.id,
          name: 'Active Extra',
          priceCents: 1000,
          quantityTotal: 10,
          active: true,
          sortOrder: 0,
        },
        {
          eventId: event.id,
          name: 'Inactive Extra',
          priceCents: 2000,
          quantityTotal: 10,
          active: false,
          sortOrder: 1,
        },
      ],
    });

    const res = await app.inject({ method: 'GET', url: `/events/${event.slug}` });
    const body = eventDetailSchema.parse(res.json());
    expect(body.extras).toHaveLength(1);
    expect(body.extras[0]!.name).toBe('Active Extra');
  });

  it('hides sold-out extras when quantityTotal is set', async () => {
    const event = await makePublishedEvent('soldout-extras');
    await prisma.ticketExtra.createMany({
      data: [
        {
          eventId: event.id,
          name: 'Available',
          priceCents: 1000,
          quantityTotal: 10,
          quantitySold: 5,
          sortOrder: 0,
        },
        {
          eventId: event.id,
          name: 'Sold Out',
          priceCents: 2000,
          quantityTotal: 10,
          quantitySold: 10,
          sortOrder: 1,
        },
      ],
    });

    const res = await app.inject({ method: 'GET', url: `/events/${event.slug}` });
    const body = eventDetailSchema.parse(res.json());
    expect(body.extras).toHaveLength(1);
    expect(body.extras[0]!.name).toBe('Available');
  });

  it('returns quantityRemaining=null when quantityTotal is null (unlimited)', async () => {
    const event = await makePublishedEvent('unlimited-extras');
    await prisma.ticketExtra.create({
      data: {
        eventId: event.id,
        name: 'Unlimited Extra',
        priceCents: 500,
        quantityTotal: null,
        quantitySold: 99,
        sortOrder: 0,
      },
    });

    const res = await app.inject({ method: 'GET', url: `/events/${event.slug}` });
    const body = eventDetailSchema.parse(res.json());
    expect(body.extras).toHaveLength(1);
    expect(body.extras[0]!.quantityRemaining).toBeNull();
  });

  it('returns extras sorted by sortOrder', async () => {
    const event = await makePublishedEvent('sorted-extras');
    await prisma.ticketExtra.createMany({
      data: [
        { eventId: event.id, name: 'C', priceCents: 100, quantityTotal: 5, sortOrder: 2 },
        { eventId: event.id, name: 'A', priceCents: 200, quantityTotal: 5, sortOrder: 0 },
        { eventId: event.id, name: 'B', priceCents: 300, quantityTotal: 5, sortOrder: 1 },
      ],
    });

    const res = await app.inject({ method: 'GET', url: `/events/${event.slug}` });
    const body = eventDetailSchema.parse(res.json());
    expect(body.extras.map((e) => e.name)).toEqual(['A', 'B', 'C']);
  });

  it('returns empty extras array when event has no extras', async () => {
    await makePublishedEvent('no-extras');

    const res = await app.inject({ method: 'GET', url: '/events/no-extras' });
    const body = eventDetailSchema.parse(res.json());
    expect(body.extras).toEqual([]);
  });
});
