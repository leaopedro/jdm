import { prisma } from '@jdm/db';
import { myTicketsResponseSchema } from '@jdm/shared/tickets';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadEnv } from '../../src/env.js';
import { verifyTicketCode } from '../../src/services/tickets/codes.js';
import { bearer, createUser, makeApp, resetDatabase } from '../helpers.js';

const env = loadEnv();

const seedTicketFor = async (userId: string, opts: { past?: boolean } = {}) => {
  const when = opts.past ? Date.now() - 30 * 86400_000 : Date.now() + 86400_000;
  const event = await prisma.event.create({
    data: {
      slug: `e-${Math.random().toString(36).slice(2, 8)}`,
      title: 'Evento',
      description: 'desc',
      startsAt: new Date(when),
      endsAt: new Date(when + 3600_000),
      venueName: 'v',
      venueAddress: 'a',
      lat: 0,
      lng: 0,
      city: 'São Paulo',
      stateCode: 'SP',
      type: 'meeting',
      status: 'published',
      capacity: 1,
      publishedAt: new Date(),
    },
  });
  const tier = await prisma.ticketTier.create({
    data: {
      eventId: event.id,
      name: 'Geral',
      priceCents: 5000,
      quantityTotal: 1,
      quantitySold: 1,
      sortOrder: 0,
    },
  });
  return prisma.ticket.create({
    data: { userId, eventId: event.id, tierId: tier.id, source: 'purchase' },
  });
};

describe('GET /me/tickets', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    await resetDatabase();
    app = await makeApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns only the caller tickets with a valid signed code', async () => {
    const { user } = await createUser({ verified: true });
    const other = await createUser({ email: 'b@jdm.test', verified: true });
    const mine = await seedTicketFor(user.id);
    await seedTicketFor(other.user.id);

    const res = await app.inject({
      method: 'GET',
      url: '/me/tickets',
      headers: { authorization: bearer(env, user.id) },
    });
    expect(res.statusCode).toBe(200);
    const body = myTicketsResponseSchema.parse(res.json());
    expect(body.items).toHaveLength(1);
    expect(body.items[0]!.id).toBe(mine.id);
    expect(verifyTicketCode(body.items[0]!.code, env)).toBe(mine.id);
  });

  it('lists upcoming first then past, sorted by event startsAt', async () => {
    const { user } = await createUser({ verified: true });
    await seedTicketFor(user.id, { past: true });
    await seedTicketFor(user.id);

    const res = await app.inject({
      method: 'GET',
      url: '/me/tickets',
      headers: { authorization: bearer(env, user.id) },
    });
    const body = myTicketsResponseSchema.parse(res.json());
    expect(body.items).toHaveLength(2);
    expect(new Date(body.items[0]!.event.startsAt).getTime()).toBeGreaterThan(Date.now());
    expect(new Date(body.items[1]!.event.startsAt).getTime()).toBeLessThan(Date.now());
  });

  it('rejects unauthenticated requests', async () => {
    const res = await app.inject({ method: 'GET', url: '/me/tickets' });
    expect(res.statusCode).toBe(401);
  });
});
