import { carSchema } from '@jdm/shared/cars';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadEnv } from '../../src/env.js';
import { bearer, createUser, makeApp, resetDatabase } from '../helpers.js';

describe('POST /me/cars', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    await resetDatabase();
    app = await makeApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('creates a car for the caller', async () => {
    const { user } = await createUser({ verified: true });
    const env = loadEnv();
    const res = await app.inject({
      method: 'POST',
      url: '/me/cars',
      headers: { authorization: bearer(env, user.id) },
      payload: { make: 'Mazda', model: 'RX-7', year: 1993, nickname: 'FD' },
    });
    expect(res.statusCode).toBe(201);
    const body = carSchema.parse(res.json());
    expect(body).toMatchObject({
      make: 'Mazda',
      model: 'RX-7',
      year: 1993,
      nickname: 'FD',
      photos: [],
    });
  });

  it('rejects invalid year', async () => {
    const { user } = await createUser({ verified: true });
    const env = loadEnv();
    const res = await app.inject({
      method: 'POST',
      url: '/me/cars',
      headers: { authorization: bearer(env, user.id) },
      payload: { make: 'Mazda', model: 'RX-7', year: 1800 },
    });
    expect(res.statusCode).toBe(400);
  });
});
