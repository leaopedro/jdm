import { prisma } from '@jdm/db';
import { consentListResponseSchema, consentRecordSchema } from '@jdm/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadEnv } from '../../src/env.js';
import { bearer, createUser, makeApp, resetDatabase } from '../helpers.js';

describe('/me/consents', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    await resetDatabase();
    app = await makeApp();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /me/consents', () => {
    it('grants consent and returns the record', async () => {
      const { user } = await createUser({ verified: true });
      const env = loadEnv();

      const res = await app.inject({
        method: 'POST',
        url: '/me/consents',
        headers: { authorization: bearer(env, user.id) },
        payload: {
          purpose: 'push_marketing',
          version: 'v1-2026-05-14',
          channel: 'mobile',
          evidence: { checkbox: true, text: 'Aceito marketing push' },
        },
      });

      expect(res.statusCode).toBe(200);
      const body = consentRecordSchema.parse(res.json());
      expect(body.purpose).toBe('push_marketing');
      expect(body.withdrawnAt).toBeNull();
    });

    it('is idempotent — same (purpose, version) returns same record', async () => {
      const { user } = await createUser({ verified: true });
      const env = loadEnv();
      const payload = {
        purpose: 'push_marketing',
        version: 'v1',
        channel: 'mobile',
        evidence: { checkbox: true },
      };

      const r1 = await app.inject({
        method: 'POST',
        url: '/me/consents',
        headers: { authorization: bearer(env, user.id) },
        payload,
      });
      const r2 = await app.inject({
        method: 'POST',
        url: '/me/consents',
        headers: { authorization: bearer(env, user.id) },
        payload,
      });

      const id1 = consentRecordSchema.parse(r1.json()).id;
      const id2 = consentRecordSchema.parse(r2.json()).id;
      expect(id1).toBe(id2);
      const count = await prisma.consent.count({ where: { userId: user.id } });
      expect(count).toBe(1);
    });

    it('rejects unauthenticated requests', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/me/consents',
        payload: {
          purpose: 'push_marketing',
          version: 'v1',
          channel: 'mobile',
          evidence: { checkbox: true },
        },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe('DELETE /me/consents/:purpose', () => {
    it('withdraws an active consent', async () => {
      const { user } = await createUser({ verified: true });
      const env = loadEnv();

      await app.inject({
        method: 'POST',
        url: '/me/consents',
        headers: { authorization: bearer(env, user.id) },
        payload: {
          purpose: 'push_marketing',
          version: 'v1',
          channel: 'mobile',
          evidence: { checkbox: true },
        },
      });

      const res = await app.inject({
        method: 'DELETE',
        url: '/me/consents/push_marketing',
        headers: { authorization: bearer(env, user.id) },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ withdrawn: true });
    });

    it('returns withdrawn: false when no active consent exists', async () => {
      const { user } = await createUser({ verified: true });
      const env = loadEnv();

      const res = await app.inject({
        method: 'DELETE',
        url: '/me/consents/push_marketing',
        headers: { authorization: bearer(env, user.id) },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ withdrawn: false });
    });

    it('rejects invalid purpose', async () => {
      const { user } = await createUser({ verified: true });
      const env = loadEnv();

      const res = await app.inject({
        method: 'DELETE',
        url: '/me/consents/invalid_purpose',
        headers: { authorization: bearer(env, user.id) },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /me/consents', () => {
    it('lists all consents for the authenticated user', async () => {
      const { user } = await createUser({ verified: true });
      const env = loadEnv();

      await app.inject({
        method: 'POST',
        url: '/me/consents',
        headers: { authorization: bearer(env, user.id) },
        payload: {
          purpose: 'push_marketing',
          version: 'v1',
          channel: 'mobile',
          evidence: { checkbox: true },
        },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/me/consents',
        headers: { authorization: bearer(env, user.id) },
      });

      expect(res.statusCode).toBe(200);
      const body = consentListResponseSchema.parse(res.json());
      expect(body.items).toHaveLength(1);
      expect(body.items[0]!.purpose).toBe('push_marketing');
    });

    it('returns empty list when no consents exist', async () => {
      const { user } = await createUser({ verified: true });
      const env = loadEnv();

      const res = await app.inject({
        method: 'GET',
        url: '/me/consents',
        headers: { authorization: bearer(env, user.id) },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ items: [] });
    });
  });
});
