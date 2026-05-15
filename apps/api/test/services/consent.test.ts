import { prisma } from '@jdm/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  hasActiveConsent,
  listUserConsents,
  recordConsent,
  withdrawConsent,
} from '../../src/services/consent.js';
import { createUser, resetDatabase } from '../helpers.js';

describe('consent service', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterEach(async () => {
    // noop
  });

  describe('recordConsent', () => {
    it('creates a new consent row', async () => {
      const { user } = await createUser({ verified: true });
      const result = await recordConsent({
        userId: user.id,
        purpose: 'push_marketing',
        version: 'v1-2026-05-14',
        channel: 'mobile',
        ipAddress: '127.0.0.1',
        userAgent: 'TestAgent/1.0',
        evidence: { checkbox: true, text: 'Aceito receber notificações de marketing' },
      });

      expect(result.id).toBeDefined();
      expect(result.purpose).toBe('push_marketing');
      expect(result.version).toBe('v1-2026-05-14');
      expect(result.withdrawnAt).toBeNull();
    });

    it('is idempotent on (userId, purpose, version)', async () => {
      const { user } = await createUser({ verified: true });
      const params = {
        userId: user.id,
        purpose: 'push_marketing' as const,
        version: 'v1-2026-05-14',
        channel: 'mobile' as const,
        ipAddress: '127.0.0.1',
        userAgent: 'TestAgent/1.0',
        evidence: { checkbox: true },
      };

      const first = await recordConsent(params);
      const second = await recordConsent(params);
      expect(first.id).toBe(second.id);

      const count = await prisma.consent.count({
        where: { userId: user.id, purpose: 'push_marketing' },
      });
      expect(count).toBe(1);
    });

    it('re-granting after withdrawal clears withdrawnAt', async () => {
      const { user } = await createUser({ verified: true });
      const params = {
        userId: user.id,
        purpose: 'email_marketing' as const,
        version: 'v1',
        channel: 'mobile' as const,
        ipAddress: '127.0.0.1',
        userAgent: 'TestAgent/1.0',
        evidence: { checkbox: true },
      };

      await recordConsent(params);
      await withdrawConsent(user.id, 'email_marketing');
      const regranted = await recordConsent(params);
      expect(regranted.withdrawnAt).toBeNull();
    });
  });

  describe('withdrawConsent', () => {
    it('sets withdrawnAt on the active consent row', async () => {
      const { user } = await createUser({ verified: true });
      await recordConsent({
        userId: user.id,
        purpose: 'push_marketing',
        version: 'v1',
        channel: 'mobile',
        ipAddress: '127.0.0.1',
        userAgent: 'TestAgent/1.0',
        evidence: { checkbox: true },
      });

      const result = await withdrawConsent(user.id, 'push_marketing');
      expect(result).toBe(true);

      const row = await prisma.consent.findFirst({
        where: { userId: user.id, purpose: 'push_marketing' },
      });
      expect(row?.withdrawnAt).not.toBeNull();
    });

    it('returns false when no active consent exists', async () => {
      const { user } = await createUser({ verified: true });
      const result = await withdrawConsent(user.id, 'push_marketing');
      expect(result).toBe(false);
    });
  });

  describe('hasActiveConsent', () => {
    it('returns true when consent is active', async () => {
      const { user } = await createUser({ verified: true });
      await recordConsent({
        userId: user.id,
        purpose: 'push_marketing',
        version: 'v1',
        channel: 'mobile',
        ipAddress: '127.0.0.1',
        userAgent: 'TestAgent/1.0',
        evidence: { checkbox: true },
      });

      const result = await hasActiveConsent(user.id, 'push_marketing');
      expect(result).toBe(true);
    });

    it('returns false when consent is withdrawn', async () => {
      const { user } = await createUser({ verified: true });
      await recordConsent({
        userId: user.id,
        purpose: 'push_marketing',
        version: 'v1',
        channel: 'mobile',
        ipAddress: '127.0.0.1',
        userAgent: 'TestAgent/1.0',
        evidence: { checkbox: true },
      });
      await withdrawConsent(user.id, 'push_marketing');

      const result = await hasActiveConsent(user.id, 'push_marketing');
      expect(result).toBe(false);
    });

    it('returns false when no consent row exists', async () => {
      const { user } = await createUser({ verified: true });
      const result = await hasActiveConsent(user.id, 'push_marketing');
      expect(result).toBe(false);
    });
  });

  describe('listUserConsents', () => {
    it('returns all consent records for the user', async () => {
      const { user } = await createUser({ verified: true });
      await recordConsent({
        userId: user.id,
        purpose: 'push_marketing',
        version: 'v1',
        channel: 'mobile',
        ipAddress: '127.0.0.1',
        userAgent: 'TestAgent/1.0',
        evidence: { checkbox: true },
      });
      await recordConsent({
        userId: user.id,
        purpose: 'email_marketing',
        version: 'v1',
        channel: 'mobile',
        ipAddress: '127.0.0.1',
        userAgent: 'TestAgent/1.0',
        evidence: { checkbox: true },
      });

      const records = await listUserConsents(user.id);
      expect(records).toHaveLength(2);
      expect(records.map((r) => r.purpose).sort()).toEqual(['email_marketing', 'push_marketing']);
    });
  });
});
