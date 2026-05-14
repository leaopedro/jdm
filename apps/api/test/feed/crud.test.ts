/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { prisma } from '@jdm/db';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadEnv } from '../../src/env.js';
import { bearer, createUser, makeApp, resetDatabase } from '../helpers.js';

const env = loadEnv();

const seedEvent = (overrides: {
  feedAccess?: 'public' | 'attendees' | 'members_only';
  postingAccess?: 'attendees' | 'members_only' | 'organizers_only';
  feedEnabled?: boolean;
} = {}) =>
  prisma.event.create({
    data: {
      title: 'Feed Test Event',
      slug: `fte-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      description: 'desc',
      startsAt: new Date('2026-07-01T18:00:00Z'),
      endsAt: new Date('2026-07-01T22:00:00Z'),
      type: 'meeting',
      status: 'published',
      capacity: 100,
      feedEnabled: overrides.feedEnabled ?? true,
      feedAccess: overrides.feedAccess ?? 'public',
      postingAccess: overrides.postingAccess ?? 'attendees',
    },
  });

const seedTier = (eventId: string) =>
  prisma.ticketTier.create({
    data: { eventId, name: 'Geral', priceCents: 0, quantityTotal: 100 },
  });

const seedTicket = (userId: string, eventId: string, tierId: string) =>
  prisma.ticket.create({
    data: { userId, eventId, tierId, source: 'purchase', status: 'valid' },
  });

const seedCar = (userId: string) =>
  prisma.car.create({
    data: { userId, make: 'Honda', model: 'Civic', year: 2020 },
  });

describe('GET /events/:eventId/feed', () => {
  let app: FastifyInstance;
  beforeEach(async () => { await resetDatabase(); app = await makeApp(); });
  afterEach(() => app.close());

  it('returns 404 for unknown event', async () => {
    const res = await app.inject({ method: 'GET', url: '/events/unknown/feed' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 200 with empty posts for public event (no auth)', async () => {
    const event = await seedEvent({ feedAccess: 'public' });
    const res = await app.inject({ method: 'GET', url: `/events/${event.id}/feed` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.posts).toEqual([]);
    expect(body.page).toBe(1);
    expect(body.total).toBe(0);
    expect(body.totalPages).toBe(0);
  });

  it('returns 403 for attendees event without auth', async () => {
    const event = await seedEvent({ feedAccess: 'attendees' });
    const res = await app.inject({ method: 'GET', url: `/events/${event.id}/feed` });
    expect(res.statusCode).toBe(403);
  });

  it('returns 403 for attendees event with non-ticket user', async () => {
    const event = await seedEvent({ feedAccess: 'attendees' });
    const { user } = await createUser({ email: 'u@jdm.test', verified: true });
    const res = await app.inject({
      method: 'GET', url: `/events/${event.id}/feed`,
      headers: { authorization: bearer(env, user.id) },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 200 for ticket holder on attendees event', async () => {
    const event = await seedEvent({ feedAccess: 'attendees' });
    const tier = await seedTier(event.id);
    const { user } = await createUser({ email: 'u@jdm.test', verified: true });
    await seedTicket(user.id, event.id, tier.id);
    const res = await app.inject({
      method: 'GET', url: `/events/${event.id}/feed`,
      headers: { authorization: bearer(env, user.id) },
    });
    expect(res.statusCode).toBe(200);
  });

  it('returns 403 for disabled feed', async () => {
    const event = await seedEvent({ feedEnabled: false, feedAccess: 'public' });
    const res = await app.inject({ method: 'GET', url: `/events/${event.id}/feed` });
    expect(res.statusCode).toBe(403);
  });

  it('paginates with page and perPage params', async () => {
    const event = await seedEvent({ feedAccess: 'public' });
    for (let i = 0; i < 7; i++) {
      await prisma.feedPost.create({ data: { eventId: event.id, body: `Post ${i}`, status: 'visible' } });
    }
    const res = await app.inject({ method: 'GET', url: `/events/${event.id}/feed?page=1&perPage=5` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.posts).toHaveLength(5);
    expect(body.total).toBe(7);
    expect(body.totalPages).toBe(2);
    expect(body.page).toBe(1);
  });

  it('page 2 returns remaining posts', async () => {
    const event = await seedEvent({ feedAccess: 'public' });
    for (let i = 0; i < 7; i++) {
      await prisma.feedPost.create({ data: { eventId: event.id, body: `Post ${i}`, status: 'visible' } });
    }
    const res = await app.inject({ method: 'GET', url: `/events/${event.id}/feed?page=2&perPage=5` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.posts).toHaveLength(2);
    expect(body.page).toBe(2);
  });

  it('hides hidden/removed posts', async () => {
    const event = await seedEvent({ feedAccess: 'public' });
    await prisma.feedPost.create({ data: { eventId: event.id, body: 'visible', status: 'visible' } });
    await prisma.feedPost.create({ data: { eventId: event.id, body: 'hidden', status: 'hidden' } });
    await prisma.feedPost.create({ data: { eventId: event.id, body: 'removed', status: 'removed' } });
    const res = await app.inject({ method: 'GET', url: `/events/${event.id}/feed` });
    const body = res.json();
    expect(body.posts).toHaveLength(1);
    expect(body.posts[0].body).toBe('visible');
  });
});

describe('POST /events/:eventId/feed', () => {
  let app: FastifyInstance;
  beforeEach(async () => { await resetDatabase(); app = await makeApp(); });
  afterEach(() => app.close());

  it('returns 401 without auth', async () => {
    const event = await seedEvent();
    const res = await app.inject({
      method: 'POST', url: `/events/${event.id}/feed`,
      payload: { body: 'Hello' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 when user has no ticket (attendees posting)', async () => {
    const event = await seedEvent({ feedAccess: 'public', postingAccess: 'attendees' });
    const { user } = await createUser({ email: 'u@jdm.test', verified: true });
    const res = await app.inject({
      method: 'POST', url: `/events/${event.id}/feed`,
      payload: { body: 'Hello' },
      headers: { authorization: bearer(env, user.id) },
    });
    expect(res.statusCode).toBe(403);
  });

  it('creates a post for ticket holder', async () => {
    const event = await seedEvent({ feedAccess: 'public', postingAccess: 'attendees' });
    const tier = await seedTier(event.id);
    const { user } = await createUser({ email: 'u@jdm.test', verified: true });
    await seedTicket(user.id, event.id, tier.id);
    const res = await app.inject({
      method: 'POST', url: `/events/${event.id}/feed`,
      payload: { body: 'My first post' },
      headers: { authorization: bearer(env, user.id) },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.body).toBe('My first post');
    expect(body.eventId).toBe(event.id);
    expect(body.car).toBeNull();
  });

  it('creates a post with carId linking car', async () => {
    const event = await seedEvent({ feedAccess: 'public', postingAccess: 'attendees' });
    const tier = await seedTier(event.id);
    const { user } = await createUser({ email: 'u@jdm.test', verified: true });
    await seedTicket(user.id, event.id, tier.id);
    const car = await seedCar(user.id);
    const res = await app.inject({
      method: 'POST', url: `/events/${event.id}/feed`,
      payload: { body: 'With car', carId: car.id },
      headers: { authorization: bearer(env, user.id) },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.car).not.toBeNull();
    expect(body.car.id).toBe(car.id);
  });
});

describe('PATCH /events/:eventId/feed/:postId', () => {
  let app: FastifyInstance;
  beforeEach(async () => { await resetDatabase(); app = await makeApp(); });
  afterEach(() => app.close());

  it('returns 401 without auth', async () => {
    const event = await seedEvent();
    const post = await prisma.feedPost.create({ data: { eventId: event.id, body: 'original', status: 'visible' } });
    const res = await app.inject({
      method: 'PATCH', url: `/events/${event.id}/feed/${post.id}`,
      payload: { body: 'updated' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 when user is not author', async () => {
    const event = await seedEvent();
    const { user: author } = await createUser({ email: 'a@jdm.test', verified: true });
    const { user: other } = await createUser({ email: 'b@jdm.test', verified: true });
    const post = await prisma.feedPost.create({ data: { eventId: event.id, body: 'original', status: 'visible', authorUserId: author.id } });
    const res = await app.inject({
      method: 'PATCH', url: `/events/${event.id}/feed/${post.id}`,
      payload: { body: 'hijack' },
      headers: { authorization: bearer(env, other.id) },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 400 when carId is included in patch', async () => {
    const event = await seedEvent();
    const { user } = await createUser({ email: 'u@jdm.test', verified: true });
    const post = await prisma.feedPost.create({ data: { eventId: event.id, body: 'original', status: 'visible', authorUserId: user.id } });
    const res = await app.inject({
      method: 'PATCH', url: `/events/${event.id}/feed/${post.id}`,
      payload: { body: 'updated', carId: 'some-car' },
      headers: { authorization: bearer(env, user.id) },
    });
    expect(res.statusCode).toBe(400);
  });

  it('updates body for author', async () => {
    const event = await seedEvent();
    const { user } = await createUser({ email: 'u@jdm.test', verified: true });
    const post = await prisma.feedPost.create({ data: { eventId: event.id, body: 'original', status: 'visible', authorUserId: user.id } });
    const res = await app.inject({
      method: 'PATCH', url: `/events/${event.id}/feed/${post.id}`,
      payload: { body: 'updated body' },
      headers: { authorization: bearer(env, user.id) },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.body).toBe('updated body');
  });
});

describe('DELETE /events/:eventId/feed/:postId', () => {
  let app: FastifyInstance;
  beforeEach(async () => { await resetDatabase(); app = await makeApp(); });
  afterEach(() => app.close());

  it('returns 401 without auth', async () => {
    const event = await seedEvent();
    const post = await prisma.feedPost.create({ data: { eventId: event.id, body: 'x', status: 'visible' } });
    const res = await app.inject({ method: 'DELETE', url: `/events/${event.id}/feed/${post.id}` });
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 for non-author', async () => {
    const event = await seedEvent();
    const { user: author } = await createUser({ email: 'a@jdm.test' });
    const { user: other } = await createUser({ email: 'b@jdm.test' });
    const post = await prisma.feedPost.create({ data: { eventId: event.id, body: 'x', status: 'visible', authorUserId: author.id } });
    const res = await app.inject({
      method: 'DELETE', url: `/events/${event.id}/feed/${post.id}`,
      headers: { authorization: bearer(env, other.id) },
    });
    expect(res.statusCode).toBe(403);
  });

  it('deletes post for author', async () => {
    const event = await seedEvent();
    const { user } = await createUser({ email: 'u@jdm.test' });
    const post = await prisma.feedPost.create({ data: { eventId: event.id, body: 'x', status: 'visible', authorUserId: user.id } });
    const res = await app.inject({
      method: 'DELETE', url: `/events/${event.id}/feed/${post.id}`,
      headers: { authorization: bearer(env, user.id) },
    });
    expect(res.statusCode).toBe(204);
    const deleted = await prisma.feedPost.findUnique({ where: { id: post.id } });
    expect(deleted).toBeNull();
  });

  it('organizer can delete any post', async () => {
    const event = await seedEvent();
    const { user: author } = await createUser({ email: 'a@jdm.test' });
    const { user: org } = await createUser({ email: 'org@jdm.test', role: 'organizer' });
    const post = await prisma.feedPost.create({ data: { eventId: event.id, body: 'x', status: 'visible', authorUserId: author.id } });
    const res = await app.inject({
      method: 'DELETE', url: `/events/${event.id}/feed/${post.id}`,
      headers: { authorization: bearer(env, org.id, 'organizer') },
    });
    expect(res.statusCode).toBe(204);
  });
});

describe('GET /events/:eventId/feed/:postId/comments', () => {
  let app: FastifyInstance;
  beforeEach(async () => { await resetDatabase(); app = await makeApp(); });
  afterEach(() => app.close());

  it('returns 404 for unknown post', async () => {
    const event = await seedEvent({ feedAccess: 'public' });
    const res = await app.inject({ method: 'GET', url: `/events/${event.id}/feed/unknown/comments` });
    expect(res.statusCode).toBe(404);
  });

  it('returns comments with pagination', async () => {
    const event = await seedEvent({ feedAccess: 'public' });
    const post = await prisma.feedPost.create({ data: { eventId: event.id, body: 'post', status: 'visible' } });
    for (let i = 0; i < 3; i++) {
      await prisma.feedComment.create({ data: { postId: post.id, body: `Comment ${i}`, status: 'visible' } });
    }
    const res = await app.inject({ method: 'GET', url: `/events/${event.id}/feed/${post.id}/comments` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.comments).toHaveLength(3);
    expect(body.total).toBe(3);
  });

  it('hides hidden/removed comments', async () => {
    const event = await seedEvent({ feedAccess: 'public' });
    const post = await prisma.feedPost.create({ data: { eventId: event.id, body: 'post', status: 'visible' } });
    await prisma.feedComment.create({ data: { postId: post.id, body: 'visible', status: 'visible' } });
    await prisma.feedComment.create({ data: { postId: post.id, body: 'hidden', status: 'hidden' } });
    const res = await app.inject({ method: 'GET', url: `/events/${event.id}/feed/${post.id}/comments` });
    const body = res.json();
    expect(body.comments).toHaveLength(1);
    expect(body.comments[0].body).toBe('visible');
  });
});

describe('POST /events/:eventId/feed/:postId/comments', () => {
  let app: FastifyInstance;
  beforeEach(async () => { await resetDatabase(); app = await makeApp(); });
  afterEach(() => app.close());

  it('returns 401 without auth', async () => {
    const event = await seedEvent({ feedAccess: 'public' });
    const post = await prisma.feedPost.create({ data: { eventId: event.id, body: 'post', status: 'visible' } });
    const res = await app.inject({
      method: 'POST', url: `/events/${event.id}/feed/${post.id}/comments`,
      payload: { body: 'comment' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('creates a comment for ticket holder', async () => {
    const event = await seedEvent({ feedAccess: 'public', postingAccess: 'attendees' });
    const tier = await seedTier(event.id);
    const { user } = await createUser({ email: 'u@jdm.test', verified: true });
    await seedTicket(user.id, event.id, tier.id);
    const post = await prisma.feedPost.create({ data: { eventId: event.id, body: 'post', status: 'visible' } });
    const res = await app.inject({
      method: 'POST', url: `/events/${event.id}/feed/${post.id}/comments`,
      payload: { body: 'nice car!' },
      headers: { authorization: bearer(env, user.id) },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.body).toBe('nice car!');
    expect(body.postId).toBe(post.id);
  });
});

describe('DELETE /events/:eventId/feed/comments/:commentId', () => {
  let app: FastifyInstance;
  beforeEach(async () => { await resetDatabase(); app = await makeApp(); });
  afterEach(() => app.close());

  it('returns 401 without auth', async () => {
    const event = await seedEvent({ feedAccess: 'public' });
    const post = await prisma.feedPost.create({ data: { eventId: event.id, body: 'post', status: 'visible' } });
    const comment = await prisma.feedComment.create({ data: { postId: post.id, body: 'comment', status: 'visible' } });
    const res = await app.inject({ method: 'DELETE', url: `/events/${event.id}/feed/comments/${comment.id}` });
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 for non-author', async () => {
    const event = await seedEvent({ feedAccess: 'public' });
    const { user: author } = await createUser({ email: 'a@jdm.test' });
    const { user: other } = await createUser({ email: 'b@jdm.test' });
    const post = await prisma.feedPost.create({ data: { eventId: event.id, body: 'post', status: 'visible' } });
    const comment = await prisma.feedComment.create({ data: { postId: post.id, body: 'comment', status: 'visible', authorUserId: author.id } });
    const res = await app.inject({
      method: 'DELETE', url: `/events/${event.id}/feed/comments/${comment.id}`,
      headers: { authorization: bearer(env, other.id) },
    });
    expect(res.statusCode).toBe(403);
  });

  it('deletes comment for author', async () => {
    const event = await seedEvent({ feedAccess: 'public' });
    const { user } = await createUser({ email: 'u@jdm.test' });
    const post = await prisma.feedPost.create({ data: { eventId: event.id, body: 'post', status: 'visible' } });
    const comment = await prisma.feedComment.create({ data: { postId: post.id, body: 'comment', status: 'visible', authorUserId: user.id } });
    const res = await app.inject({
      method: 'DELETE', url: `/events/${event.id}/feed/comments/${comment.id}`,
      headers: { authorization: bearer(env, user.id) },
    });
    expect(res.statusCode).toBe(204);
    const deleted = await prisma.feedComment.findUnique({ where: { id: comment.id } });
    expect(deleted).toBeNull();
  });
});

describe('POST /events/:eventId/feed/:postId/reactions', () => {
  let app: FastifyInstance;
  beforeEach(async () => { await resetDatabase(); app = await makeApp(); });
  afterEach(() => app.close());

  it('returns 401 without auth', async () => {
    const event = await seedEvent({ feedAccess: 'public' });
    const post = await prisma.feedPost.create({ data: { eventId: event.id, body: 'post', status: 'visible' } });
    const res = await app.inject({
      method: 'POST', url: `/events/${event.id}/feed/${post.id}/reactions`,
      payload: { kind: 'like' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('creates a like reaction', async () => {
    const event = await seedEvent({ feedAccess: 'public' });
    const { user } = await createUser({ email: 'u@jdm.test' });
    const post = await prisma.feedPost.create({ data: { eventId: event.id, body: 'post', status: 'visible' } });
    const res = await app.inject({
      method: 'POST', url: `/events/${event.id}/feed/${post.id}/reactions`,
      payload: { kind: 'like' },
      headers: { authorization: bearer(env, user.id) },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.likes).toBe(1);
    expect(body.mine).toBe(true);
  });

  it('toggling same kind removes reaction', async () => {
    const event = await seedEvent({ feedAccess: 'public' });
    const { user } = await createUser({ email: 'u@jdm.test' });
    const post = await prisma.feedPost.create({ data: { eventId: event.id, body: 'post', status: 'visible' } });
    await app.inject({
      method: 'POST', url: `/events/${event.id}/feed/${post.id}/reactions`,
      payload: { kind: 'like' },
      headers: { authorization: bearer(env, user.id) },
    });
    const res = await app.inject({
      method: 'POST', url: `/events/${event.id}/feed/${post.id}/reactions`,
      payload: { kind: 'like' },
      headers: { authorization: bearer(env, user.id) },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.likes).toBe(0);
    expect(body.mine).toBe(false);
  });

  it('switching from like to dislike removes like atomically', async () => {
    const event = await seedEvent({ feedAccess: 'public' });
    const { user } = await createUser({ email: 'u@jdm.test' });
    const post = await prisma.feedPost.create({ data: { eventId: event.id, body: 'post', status: 'visible' } });
    await app.inject({
      method: 'POST', url: `/events/${event.id}/feed/${post.id}/reactions`,
      payload: { kind: 'like' },
      headers: { authorization: bearer(env, user.id) },
    });
    const res = await app.inject({
      method: 'POST', url: `/events/${event.id}/feed/${post.id}/reactions`,
      payload: { kind: 'dislike' },
      headers: { authorization: bearer(env, user.id) },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.likes).toBe(0);
    expect(body.mine).toBe(true);
    const rows = await prisma.feedReaction.findMany({ where: { postId: post.id, userId: user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe('dislike');
  });
});
