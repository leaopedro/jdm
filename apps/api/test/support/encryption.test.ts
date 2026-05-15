import { prisma } from '@jdm/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadEnv } from '../../src/env.js';
import { decryptField } from '../../src/services/crypto/field-encryption.js';
import { bearer, createUser, makeApp, resetDatabase } from '../helpers.js';

describe('SupportTicket field encryption', () => {
  let app: Awaited<ReturnType<typeof makeApp>>;
  const env = loadEnv();

  beforeEach(async () => {
    await resetDatabase();
    app = await makeApp();
  });
  afterEach(async () => {
    await app.close();
  });

  it('stores message encrypted in DB, returns decrypted via API', async () => {
    const { user } = await createUser({ verified: true });
    const plainMessage = 'Preciso de ajuda com meu ingresso do evento';

    const res = await app.inject({
      method: 'POST',
      url: '/me/support-tickets',
      headers: { authorization: bearer(env, user.id) },
      payload: { phone: '11999999999', message: plainMessage },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ message: plainMessage });

    const dbRow = await prisma.supportTicket.findFirst({ where: { userId: user.id } });
    expect(dbRow!.message).not.toBe(plainMessage);
    expect(dbRow!.message.startsWith('v1:')).toBe(true);

    const decrypted = decryptField(dbRow!.message, env.FIELD_ENCRYPTION_KEY);
    expect(decrypted).toBe(plainMessage);
  });

  it('list endpoint returns decrypted messages', async () => {
    const { user } = await createUser({ verified: true });
    const msg = 'Mensagem de teste para listagem';

    await app.inject({
      method: 'POST',
      url: '/me/support-tickets',
      headers: { authorization: bearer(env, user.id) },
      payload: { phone: '11999999999', message: msg },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/me/support-tickets',
      headers: { authorization: bearer(env, user.id) },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ items: [{ message: msg }] });
  });
});
