import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadEnv } from '../../src/env.js';
import { bearer, createUser, makeApp, resetDatabase } from '../helpers.js';

describe('requireRole preHandler', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    await resetDatabase();
    app = await makeApp();
    app.get(
      '/__role-probe',
      { preHandler: [app.authenticate, app.requireRole('organizer', 'admin')] },
      () => ({ ok: true }),
    );
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/__role-probe' });
    expect(res.statusCode).toBe(401);
  });

  it('403 for user role', async () => {
    const { user } = await createUser({ email: 'u@jdm.test', verified: true, role: 'user' });
    const res = await app.inject({
      method: 'GET',
      url: '/__role-probe',
      headers: { authorization: bearer(loadEnv(), user.id, 'user') },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: 'Forbidden' });
  });

  it('200 for organizer', async () => {
    const { user } = await createUser({ email: 'o@jdm.test', verified: true, role: 'organizer' });
    const res = await app.inject({
      method: 'GET',
      url: '/__role-probe',
      headers: { authorization: bearer(loadEnv(), user.id, 'organizer') },
    });
    expect(res.statusCode).toBe(200);
  });

  it('200 for admin', async () => {
    const { user } = await createUser({ email: 'a@jdm.test', verified: true, role: 'admin' });
    const res = await app.inject({
      method: 'GET',
      url: '/__role-probe',
      headers: { authorization: bearer(loadEnv(), user.id, 'admin') },
    });
    expect(res.statusCode).toBe(200);
  });
});
