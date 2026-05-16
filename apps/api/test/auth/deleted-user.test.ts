import { prisma } from '@jdm/db';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadEnv } from '../../src/env.js';
import { issueRefreshToken } from '../../src/services/auth/tokens.js';
import { bearer, createUser, makeApp, resetDatabase } from '../helpers.js';

const seedRefresh = async (userId: string) => {
  const env = loadEnv();
  const issued = issueRefreshToken(env);
  await prisma.refreshToken.create({
    data: { userId, tokenHash: issued.hash, expiresAt: issued.expiresAt },
  });
  return issued.token;
};

describe('deleted / anonymized user auth guards', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    await resetDatabase();
    app = await makeApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('deleted user gets 401 AccountDisabled on authed endpoint', async () => {
    const { user } = await createUser({ email: 'del@jdm.test', verified: true });
    await prisma.user.update({
      where: { id: user.id },
      data: { status: 'deleted', deletedAt: new Date() },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: bearer(loadEnv(), user.id, 'user') },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: 'AccountDisabled' });
  });

  it('anonymized user gets 401 AccountDisabled on authed endpoint', async () => {
    const { user } = await createUser({ email: 'anon@jdm.test', verified: true });
    await prisma.user.update({
      where: { id: user.id },
      data: { status: 'anonymized', anonymizedAt: new Date() },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: bearer(loadEnv(), user.id, 'user') },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: 'AccountDisabled' });
  });

  it('deleted user cannot login', async () => {
    const { user, password } = await createUser({ email: 'del@jdm.test', verified: true });
    await prisma.user.update({
      where: { id: user.id },
      data: { status: 'deleted', deletedAt: new Date() },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'del@jdm.test', password },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: 'AccountDisabled' });
  });

  it('anonymized user cannot login', async () => {
    const { user, password } = await createUser({ email: 'anon@jdm.test', verified: true });
    await prisma.user.update({
      where: { id: user.id },
      data: { status: 'anonymized', anonymizedAt: new Date() },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'anon@jdm.test', password },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: 'AccountDisabled' });
  });

  it('deleted user skipped by tryAuth (returns anonymous)', async () => {
    const { user } = await createUser({ email: 'del@jdm.test', verified: true });
    await prisma.user.update({
      where: { id: user.id },
      data: { status: 'deleted', deletedAt: new Date() },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/events',
      headers: { authorization: bearer(loadEnv(), user.id, 'user') },
    });
    expect(res.statusCode).toBe(200);
  });

  it('forgot-password does not send email for deleted user', async () => {
    const { user } = await createUser({ email: 'del@jdm.test', verified: true });
    await prisma.user.update({
      where: { id: user.id },
      data: { status: 'deleted', deletedAt: new Date() },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/forgot-password',
      payload: { email: 'del@jdm.test' },
    });
    expect(res.statusCode).toBe(200);

    const tokens = await prisma.passwordResetToken.findMany({
      where: { userId: user.id },
    });
    expect(tokens.length).toBe(0);
  });

  it('broadcast targets exclude deleted users', async () => {
    const { user } = await createUser({ email: 'del@jdm.test', verified: true });
    await prisma.user.update({
      where: { id: user.id },
      data: { status: 'deleted', deletedAt: new Date() },
    });

    const activeUsers = await prisma.user.findMany({
      where: { status: 'active', role: 'user' },
    });
    const ids = activeUsers.map((u) => u.id);
    expect(ids).not.toContain(user.id);
  });

  it('deleted user cannot refresh token', async () => {
    const { user } = await createUser({ email: 'del@jdm.test', verified: true });
    const token = await seedRefresh(user.id);
    await prisma.user.update({
      where: { id: user.id },
      data: { status: 'deleted', deletedAt: new Date() },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: token },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: 'AccountDisabled' });

    const tokens = await prisma.refreshToken.findMany({
      where: { userId: user.id, revokedAt: { not: null } },
    });
    expect(tokens.length).toBe(1);
  });

  it('anonymized user cannot refresh token', async () => {
    const { user } = await createUser({ email: 'anon@jdm.test', verified: true });
    const token = await seedRefresh(user.id);
    await prisma.user.update({
      where: { id: user.id },
      data: { status: 'anonymized', anonymizedAt: new Date() },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: token },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: 'AccountDisabled' });
  });

  it('deletedAt and anonymizedAt are null for active users', async () => {
    const { user } = await createUser({ email: 'active@jdm.test', verified: true });
    const row = await prisma.user.findUnique({
      where: { id: user.id },
      select: { deletedAt: true, anonymizedAt: true, status: true },
    });
    expect(row?.status).toBe('active');
    expect(row?.deletedAt).toBeNull();
    expect(row?.anonymizedAt).toBeNull();
  });
});
