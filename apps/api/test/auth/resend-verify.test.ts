import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DevMailer } from '../../src/services/mailer/dev.js';
import { createUser, makeApp, resetDatabase } from '../helpers.js';

describe('POST /auth/resend-verify', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    await resetDatabase();
    app = await makeApp();
    (app.mailer as DevMailer).clear();
  });

  afterEach(async () => {
    await app.close();
  });

  it('sends a new email for unverified users', async () => {
    const { user } = await createUser({ email: 'u@jdm.test' });
    const res = await app.inject({
      method: 'POST',
      url: '/auth/resend-verify',
      payload: { email: user.email },
    });
    expect(res.statusCode).toBe(200);
    expect((app.mailer as DevMailer).find('u@jdm.test')).toBeDefined();
  });

  it('returns 200 even for unknown emails (no enumeration)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/resend-verify',
      payload: { email: 'ghost@jdm.test' },
    });
    expect(res.statusCode).toBe(200);
    expect((app.mailer as DevMailer).captured).toHaveLength(0);
  });

  it('no-ops for already-verified users', async () => {
    const { user } = await createUser({ email: 'v@jdm.test', verified: true });
    const res = await app.inject({
      method: 'POST',
      url: '/auth/resend-verify',
      payload: { email: user.email },
    });
    expect(res.statusCode).toBe(200);
    expect((app.mailer as DevMailer).captured).toHaveLength(0);
  });
});
