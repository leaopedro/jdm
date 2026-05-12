import { prisma } from '@jdm/db';
import { pushPrefsSchema } from '@jdm/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadEnv } from '../../src/env.js';
import { bearer, createUser, makeApp, resetDatabase } from '../helpers.js';

describe('/me/push-preferences', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    await resetDatabase();
    app = await makeApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns the current push preferences', async () => {
    const { user } = await createUser({ verified: true });
    const env = loadEnv();

    const res = await app.inject({
      method: 'GET',
      url: '/me/push-preferences',
      headers: { authorization: bearer(env, user.id) },
    });

    expect(res.statusCode).toBe(200);
    expect(pushPrefsSchema.parse(res.json())).toEqual({
      transactional: true,
      marketing: true,
    });
  });

  it('updates only the marketing preference', async () => {
    const { user } = await createUser({ verified: true });
    const env = loadEnv();

    const res = await app.inject({
      method: 'PATCH',
      url: '/me/push-preferences',
      headers: { authorization: bearer(env, user.id) },
      payload: { marketing: false },
    });

    expect(res.statusCode).toBe(200);
    expect(pushPrefsSchema.parse(res.json())).toEqual({
      transactional: true,
      marketing: false,
    });

    const row = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { pushPrefs: true },
    });

    expect(pushPrefsSchema.parse(row.pushPrefs)).toEqual({
      transactional: true,
      marketing: false,
    });
  });

  it('preserves transactional when older rows omit it', async () => {
    const { user } = await createUser({ verified: true });
    const env = loadEnv();

    await prisma.user.update({
      where: { id: user.id },
      data: { pushPrefs: { marketing: false } },
    });

    const res = await app.inject({
      method: 'PATCH',
      url: '/me/push-preferences',
      headers: { authorization: bearer(env, user.id) },
      payload: { marketing: true },
    });

    expect(res.statusCode).toBe(200);
    expect(pushPrefsSchema.parse(res.json())).toEqual({
      transactional: true,
      marketing: true,
    });
  });

  it('rejects invalid payloads', async () => {
    const { user } = await createUser({ verified: true });
    const env = loadEnv();

    const res = await app.inject({
      method: 'PATCH',
      url: '/me/push-preferences',
      headers: { authorization: bearer(env, user.id) },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });
});
