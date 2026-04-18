import { prisma } from '@jdm/db';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { issueVerificationToken } from '../../src/services/auth/verification.js';
import { createUser, makeApp, resetDatabase } from '../helpers.js';

describe('GET /auth/verify', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    await resetDatabase();
    app = await makeApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('marks email verified on valid token', async () => {
    const { user } = await createUser();
    const token = await issueVerificationToken(user.id);
    const res = await app.inject({ method: 'GET', url: `/auth/verify?token=${token}` });
    expect(res.statusCode).toBe(200);
    const saved = await prisma.user.findUnique({ where: { id: user.id } });
    expect(saved?.emailVerifiedAt).not.toBeNull();
  });

  it('rejects expired tokens', async () => {
    const { user } = await createUser();
    const token = await issueVerificationToken(user.id);
    await prisma.verificationToken.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    const res = await app.inject({ method: 'GET', url: `/auth/verify?token=${token}` });
    expect(res.statusCode).toBe(400);
  });

  it('rejects reused tokens', async () => {
    const { user } = await createUser();
    const token = await issueVerificationToken(user.id);
    await app.inject({ method: 'GET', url: `/auth/verify?token=${token}` });
    const second = await app.inject({ method: 'GET', url: `/auth/verify?token=${token}` });
    expect(second.statusCode).toBe(400);
  });
});
