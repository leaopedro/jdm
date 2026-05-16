import { prisma } from '@jdm/db';
import { authResponseSchema } from '@jdm/shared/auth';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DevMailer } from '../../src/services/mailer/dev.js';
import { makeApp, resetDatabase } from '../helpers.js';

const ADULT_DOB = '1990-06-15'; // always 18+ regardless of run date
const MINOR_DOB = new Date(Date.now() - 16 * 365.25 * 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10); // 16 years ago today

describe('POST /auth/signup', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    await resetDatabase();
    app = await makeApp();
    (app.mailer as DevMailer).clear();
  });

  afterEach(async () => {
    await app.close();
  });

  it('creates a user and sends a verification email', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: {
        email: 'new@jdm.test',
        password: 'correct-horse-battery-staple',
        name: 'New',
        dateOfBirth: ADULT_DOB,
      },
    });
    expect(res.statusCode).toBe(201);
    const body = authResponseSchema.parse(res.json());
    expect(body.user.email).toBe('new@jdm.test');
    expect(body.user.emailVerifiedAt).toBeNull();
    expect(typeof body.accessToken).toBe('string');
    expect(typeof body.refreshToken).toBe('string');

    const saved = await prisma.user.findUnique({ where: { email: 'new@jdm.test' } });
    expect(saved?.passwordHash).not.toBeNull();
    expect(saved?.dateOfBirth).toEqual(new Date(`${ADULT_DOB}T00:00:00.000Z`));

    const captured = (app.mailer as DevMailer).find('new@jdm.test');
    expect(captured?.subject).toMatch(/verifique/i);
    expect(captured?.html).toContain('/verify?token=');
  });

  it('rejects duplicate emails', async () => {
    const payload = {
      email: 'dup@jdm.test',
      password: 'correct-horse-battery-staple',
      name: 'Dup',
      dateOfBirth: ADULT_DOB,
    };
    const first = await app.inject({ method: 'POST', url: '/auth/signup', payload });
    expect(first.statusCode).toBe(201);
    const second = await app.inject({ method: 'POST', url: '/auth/signup', payload });
    expect(second.statusCode).toBe(409);
  });

  it('rejects weak passwords', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: {
        email: 'weak@jdm.test',
        password: 'short',
        name: 'Weak',
        dateOfBirth: ADULT_DOB,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('normalizes email casing', async () => {
    await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: {
        email: 'Alice@JDM.Test',
        password: 'correct-horse-battery-staple',
        name: 'Alice',
        dateOfBirth: ADULT_DOB,
      },
    });
    const saved = await prisma.user.findUnique({ where: { email: 'alice@jdm.test' } });
    expect(saved).not.toBeNull();
  });

  it('rejects underage signup (minor)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: {
        email: 'teen@jdm.test',
        password: 'correct-horse-battery-staple',
        name: 'Teen',
        dateOfBirth: MINOR_DOB,
      },
    });
    expect(res.statusCode).toBe(422);
    const body = res.json<{ error: string; code: string }>();
    expect(body.code).toBe('UNDERAGE');

    const saved = await prisma.user.findUnique({ where: { email: 'teen@jdm.test' } });
    expect(saved).toBeNull();
  });

  it('rejects signup exactly 17 years old (day before 18th birthday)', async () => {
    const dob = new Date();
    dob.setFullYear(dob.getFullYear() - 18);
    dob.setDate(dob.getDate() + 1); // one day short of 18
    const dobStr = dob.toISOString().slice(0, 10);

    const res = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: {
        email: 'almost18@jdm.test',
        password: 'correct-horse-battery-staple',
        name: 'Almost',
        dateOfBirth: dobStr,
      },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json<{ code: string }>().code).toBe('UNDERAGE');
  });

  it('accepts signup exactly on 18th birthday', async () => {
    const dob = new Date();
    dob.setFullYear(dob.getFullYear() - 18);
    const dobStr = dob.toISOString().slice(0, 10);

    const res = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: {
        email: 'exactly18@jdm.test',
        password: 'correct-horse-battery-staple',
        name: 'Exactly',
        dateOfBirth: dobStr,
      },
    });
    expect(res.statusCode).toBe(201);
  });

  it('rejects missing dateOfBirth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { email: 'nodob@jdm.test', password: 'correct-horse-battery-staple', name: 'NoDob' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects invalid dateOfBirth format', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: {
        email: 'baddob@jdm.test',
        password: 'correct-horse-battery-staple',
        name: 'Bad',
        dateOfBirth: '15/06/1990',
      },
    });
    expect(res.statusCode).toBe(400);
  });
});
