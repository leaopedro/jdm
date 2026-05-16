import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadEnv } from '../src/env.js';

import { bearer, createUser, makeApp, resetDatabase } from './helpers.js';

describe('rate-limit gaps', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    await resetDatabase();
    app = await makeApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 429 after 10 POST /me/orders/:id/cancel from the same user', async () => {
    const env = loadEnv();
    const { user } = await createUser({ verified: true });
    const token = bearer(env, user.id);
    const fakeOrderId = '00000000-0000-0000-0000-000000000000';

    for (let i = 0; i < 10; i += 1) {
      const res = await app.inject({
        method: 'POST',
        url: `/me/orders/${fakeOrderId}/cancel`,
        headers: { authorization: token },
      });
      // 404 is expected since the order doesn't exist; not 429 yet
      expect(res.statusCode).toBe(404);
    }

    const res11 = await app.inject({
      method: 'POST',
      url: `/me/orders/${fakeOrderId}/cancel`,
      headers: { authorization: token },
    });
    expect(res11.statusCode).toBe(429);
  });
});
