import { prisma } from '@jdm/db';
import { GENERAL_SETTINGS_SINGLETON_ID, generalSettingsSchema } from '@jdm/shared/general-settings';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadEnv } from '../../src/env.js';
import { bearer, createUser, resetDatabase, makeApp } from '../helpers.js';

const ensureSettings = async () => {
  await prisma.generalSettings.upsert({
    where: { id: GENERAL_SETTINGS_SINGLETON_ID },
    update: {},
    create: { id: GENERAL_SETTINGS_SINGLETON_ID },
  });
};

describe('admin general settings', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    await resetDatabase();
    await prisma.generalSettings.deleteMany();
    app = await makeApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /admin/general/settings auto-seeds defaults when missing', async () => {
    const { user } = await createUser({ email: 'org@jdm.test', verified: true, role: 'organizer' });
    const res = await app.inject({
      method: 'GET',
      url: '/admin/general/settings',
      headers: { authorization: bearer(loadEnv(), user.id, 'organizer') },
    });
    expect(res.statusCode).toBe(200);
    const body = generalSettingsSchema.parse(res.json());
    expect(body.id).toBe(GENERAL_SETTINGS_SINGLETON_ID);
    expect(body.capacityDisplay.tickets).toEqual({ mode: 'absolute', thresholdPercent: 15 });
    expect(body.capacityDisplay.extras).toEqual({ mode: 'absolute', thresholdPercent: 15 });
    expect(body.capacityDisplay.products).toEqual({ mode: 'absolute', thresholdPercent: 15 });
  });

  it('PUT updates only the supplied surfaces and persists', async () => {
    await ensureSettings();
    const { user } = await createUser({ email: 'org@jdm.test', verified: true, role: 'organizer' });
    const res = await app.inject({
      method: 'PUT',
      url: '/admin/general/settings',
      headers: { authorization: bearer(loadEnv(), user.id, 'organizer') },
      payload: {
        capacityDisplay: {
          tickets: { mode: 'hidden' },
          products: { mode: 'percentage_threshold', thresholdPercent: 25 },
        },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = generalSettingsSchema.parse(res.json());
    expect(body.capacityDisplay.tickets.mode).toBe('hidden');
    expect(body.capacityDisplay.tickets.thresholdPercent).toBe(15);
    expect(body.capacityDisplay.products.mode).toBe('percentage_threshold');
    expect(body.capacityDisplay.products.thresholdPercent).toBe(25);
    expect(body.capacityDisplay.extras.mode).toBe('absolute');

    const persisted = await prisma.generalSettings.findUniqueOrThrow({
      where: { id: GENERAL_SETTINGS_SINGLETON_ID },
    });
    expect(persisted.ticketCapacityMode).toBe('hidden');
    expect(persisted.productCapacityMode).toBe('percentage_threshold');
    expect(persisted.productCapacityThresholdPercent).toBe(25);
  });

  it('PUT writes an admin audit row tagged with the touched fields', async () => {
    await ensureSettings();
    const { user } = await createUser({ email: 'org@jdm.test', verified: true, role: 'organizer' });
    await app.inject({
      method: 'PUT',
      url: '/admin/general/settings',
      headers: { authorization: bearer(loadEnv(), user.id, 'organizer') },
      payload: { capacityDisplay: { extras: { mode: 'hidden' } } },
    });
    const audits = await prisma.adminAudit.findMany({
      where: { entityType: 'general_settings' },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]!.actorId).toBe(user.id);
    expect(audits[0]!.action).toBe('general_settings.update');
    expect(audits[0]!.entityId).toBe(GENERAL_SETTINGS_SINGLETON_ID);
    const metadata = audits[0]!.metadata as { fields: string[] };
    expect(metadata.fields).toContain('capacityDisplay.extras.mode');
  });

  it('PUT rejects empty body', async () => {
    await ensureSettings();
    const { user } = await createUser({ email: 'org@jdm.test', verified: true, role: 'organizer' });
    const res = await app.inject({
      method: 'PUT',
      url: '/admin/general/settings',
      headers: { authorization: bearer(loadEnv(), user.id, 'organizer') },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('PUT rejects out-of-range threshold', async () => {
    await ensureSettings();
    const { user } = await createUser({ email: 'org@jdm.test', verified: true, role: 'organizer' });
    const res = await app.inject({
      method: 'PUT',
      url: '/admin/general/settings',
      headers: { authorization: bearer(loadEnv(), user.id, 'organizer') },
      payload: { capacityDisplay: { events: { thresholdPercent: 150 } } },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects staff role', async () => {
    await ensureSettings();
    const { user } = await createUser({ email: 'staff@jdm.test', verified: true, role: 'staff' });
    const res = await app.inject({
      method: 'GET',
      url: '/admin/general/settings',
      headers: { authorization: bearer(loadEnv(), user.id, 'staff') },
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects unauthenticated requests', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin/general/settings' });
    expect(res.statusCode).toBe(401);
  });
});
