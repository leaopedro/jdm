import { prisma } from '@jdm/db';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadEnv } from '../../../src/env.js';
import { bearer, createUser, makeApp, resetDatabase } from '../../helpers.js';

const mkEvent = (status: 'draft' | 'published' = 'draft') =>
  prisma.event.create({
    data: {
      slug: 'ev-publish-test',
      title: 't',
      description: 'd',
      startsAt: new Date(Date.now() + 86400_000),
      endsAt: new Date(Date.now() + 90000_000),
      venueName: 'v',
      venueAddress: 'a',
      city: 'São Paulo',
      stateCode: 'SP',
      type: 'meeting',
      capacity: 10,
      status,
      publishedAt: status === 'published' ? new Date() : null,
    },
  });

describe('POST /admin/events/:id/publish', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    await resetDatabase();
    app = await makeApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('flips draft → published, sets publishedAt, writes audit', async () => {
    const event = await mkEvent('draft');
    const { user } = await createUser({ email: 'o@jdm.test', verified: true, role: 'organizer' });
    const res = await app.inject({
      method: 'POST',
      url: `/admin/events/${event.id}/publish`,
      headers: { authorization: bearer(loadEnv(), user.id, 'organizer') },
    });
    expect(res.statusCode).toBe(200);
    const row = await prisma.event.findUniqueOrThrow({ where: { id: event.id } });
    expect(row.status).toBe('published');
    expect(row.publishedAt).not.toBeNull();
    const audits = await prisma.adminAudit.findMany({ where: { actorId: user.id } });
    expect(audits.map((a) => a.action)).toContain('event.publish');
  });

  it('published event immediately shows up on public GET /events', async () => {
    const event = await mkEvent('draft');
    const { user } = await createUser({ email: 'o@jdm.test', verified: true, role: 'organizer' });
    await app.inject({
      method: 'POST',
      url: `/admin/events/${event.id}/publish`,
      headers: { authorization: bearer(loadEnv(), user.id, 'organizer') },
    });
    const publicRes = await app.inject({ method: 'GET', url: '/events' });
    const body: { items: { slug: string }[] } = publicRes.json();
    expect(body.items.map((i) => i.slug)).toContain(event.slug);
  });

  it('409 when already published', async () => {
    const event = await mkEvent('published');
    const { user } = await createUser({ email: 'o@jdm.test', verified: true, role: 'organizer' });
    const res = await app.inject({
      method: 'POST',
      url: `/admin/events/${event.id}/publish`,
      headers: { authorization: bearer(loadEnv(), user.id, 'organizer') },
    });
    expect(res.statusCode).toBe(409);
  });

  it('404 unknown id', async () => {
    const { user } = await createUser({ email: 'o@jdm.test', verified: true, role: 'organizer' });
    const res = await app.inject({
      method: 'POST',
      url: '/admin/events/missing/publish',
      headers: { authorization: bearer(loadEnv(), user.id, 'organizer') },
    });
    expect(res.statusCode).toBe(404);
  });

  it('409 when event is cancelled (cancelled cannot be re-published)', async () => {
    const event = await prisma.event.create({
      data: {
        slug: 'ev-cancelled-publish',
        title: 't',
        description: 'd',
        startsAt: new Date(Date.now() + 86400_000),
        endsAt: new Date(Date.now() + 90000_000),
        venueName: 'v',
        venueAddress: 'a',
        city: 'São Paulo',
        stateCode: 'SP',
        type: 'meeting',
        capacity: 10,
        status: 'cancelled',
      },
    });
    const { user } = await createUser({ email: 'o@jdm.test', verified: true, role: 'organizer' });
    const res = await app.inject({
      method: 'POST',
      url: `/admin/events/${event.id}/publish`,
      headers: { authorization: bearer(loadEnv(), user.id, 'organizer') },
    });
    expect(res.statusCode).toBe(409);
  });
});
