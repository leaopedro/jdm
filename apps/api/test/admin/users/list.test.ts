import type { AdminUsersListResponse } from '@jdm/shared/admin';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadEnv } from '../../../src/env.js';
import { bearer, createUser, makeApp, resetDatabase } from '../../helpers.js';

const json = (res: { json: () => unknown }) => res.json() as AdminUsersListResponse;

describe('GET /admin/users', () => {
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
    const res = await app.inject({ method: 'GET', url: '/admin/users' });
    expect(res.statusCode).toBe(401);
  });

  it('403 for user role', async () => {
    const { user } = await createUser({ email: 'u@test.com', verified: true, role: 'user' });
    const res = await app.inject({
      method: 'GET',
      url: '/admin/users',
      headers: { authorization: bearer(env(), user.id, 'user') },
    });
    expect(res.statusCode).toBe(403);
  });

  it('403 for staff role', async () => {
    const { user } = await createUser({ email: 's@test.com', verified: true, role: 'staff' });
    const res = await app.inject({
      method: 'GET',
      url: '/admin/users',
      headers: { authorization: bearer(env(), user.id, 'staff') },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns users list for organizer', async () => {
    const { user: org } = await createUser({
      email: 'o@test.com',
      name: 'Organizer',
      verified: true,
      role: 'organizer',
    });
    await createUser({ email: 'a@test.com', name: 'Alice', verified: true });

    const res = await app.inject({
      method: 'GET',
      url: '/admin/users',
      headers: { authorization: bearer(env(), org.id, 'organizer') },
    });
    expect(res.statusCode).toBe(200);
    const body = json(res);
    expect(body.items.length).toBeGreaterThanOrEqual(2);
    const alice = body.items.find((u) => u.email === 'a@test.com');
    expect(alice).toBeDefined();
    expect(alice!.name).toBe('Alice');
    expect(alice!.avatarUrl).toBeNull();
  });

  it('searches by name fragment (q param, case insensitive)', async () => {
    const { user: org } = await createUser({
      email: 'o@test.com',
      verified: true,
      role: 'organizer',
    });
    await createUser({ email: 'alice@test.com', name: 'Alice Santos', verified: true });
    await createUser({ email: 'bob@test.com', name: 'Bob Silva', verified: true });

    const res = await app.inject({
      method: 'GET',
      url: '/admin/users?q=alice',
      headers: { authorization: bearer(env(), org.id, 'organizer') },
    });
    expect(res.statusCode).toBe(200);
    const body = json(res);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]!.name).toBe('Alice Santos');
  });

  it('searches by email fragment (q param)', async () => {
    const { user: org } = await createUser({
      email: 'o@test.com',
      verified: true,
      role: 'organizer',
    });
    await createUser({ email: 'alice@test.com', name: 'Alice', verified: true });
    await createUser({ email: 'bob@test.com', name: 'Bob', verified: true });

    const res = await app.inject({
      method: 'GET',
      url: '/admin/users?q=bob%40test',
      headers: { authorization: bearer(env(), org.id, 'organizer') },
    });
    expect(res.statusCode).toBe(200);
    const body = json(res);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]!.email).toBe('bob@test.com');
  });

  it('cursor paginates correctly', async () => {
    const { user: org } = await createUser({
      email: 'o@test.com',
      verified: true,
      role: 'organizer',
    });
    await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        createUser({ email: `u${i}@test.com`, name: `User${i}`, verified: true }),
      ),
    );

    const res1 = await app.inject({
      method: 'GET',
      url: '/admin/users?limit=3',
      headers: { authorization: bearer(env(), org.id, 'organizer') },
    });
    expect(res1.statusCode).toBe(200);
    const body1 = json(res1);
    expect(body1.items).toHaveLength(3);
    expect(body1.nextCursor).toBeTruthy();

    const res2 = await app.inject({
      method: 'GET',
      url: `/admin/users?limit=3&cursor=${body1.nextCursor}`,
      headers: { authorization: bearer(env(), org.id, 'organizer') },
    });
    expect(res2.statusCode).toBe(200);
    const body2 = json(res2);
    expect(body2.items).toHaveLength(3);

    const allIds = [...body1.items.map((i) => i.id), ...body2.items.map((i) => i.id)];
    expect(new Set(allIds).size).toBe(6);
  });

  it('cursor + search combined returns only matching users across pages', async () => {
    const { user: org } = await createUser({
      email: 'o@test.com',
      verified: true,
      role: 'organizer',
    });
    await Promise.all(
      Array.from({ length: 4 }, (_, i) =>
        createUser({ email: `alice${i}@test.com`, name: `Alice ${i}`, verified: true }),
      ),
    );
    await createUser({ email: 'bob@test.com', name: 'Bob', verified: true });

    const res1 = await app.inject({
      method: 'GET',
      url: '/admin/users?q=alice&limit=2',
      headers: { authorization: bearer(env(), org.id, 'organizer') },
    });
    expect(res1.statusCode).toBe(200);
    const body1 = json(res1);
    expect(body1.items).toHaveLength(2);
    expect(body1.nextCursor).toBeTruthy();
    expect(body1.items.every((u) => u.name.startsWith('Alice'))).toBe(true);

    const res2 = await app.inject({
      method: 'GET',
      url: `/admin/users?q=alice&limit=2&cursor=${body1.nextCursor}`,
      headers: { authorization: bearer(env(), org.id, 'organizer') },
    });
    expect(res2.statusCode).toBe(200);
    const body2 = json(res2);
    expect(body2.items).toHaveLength(2);
    expect(body2.items.every((u) => u.name.startsWith('Alice'))).toBe(true);

    const allIds = [...body1.items.map((i) => i.id), ...body2.items.map((i) => i.id)];
    expect(new Set(allIds).size).toBe(4);
  });

  it('400 on invalid cursor', async () => {
    const { user: org } = await createUser({
      email: 'o@test.com',
      verified: true,
      role: 'organizer',
    });
    const res = await app.inject({
      method: 'GET',
      url: '/admin/users?cursor=bad!!!',
      headers: { authorization: bearer(env(), org.id, 'organizer') },
    });
    expect(res.statusCode).toBe(400);
  });
});
