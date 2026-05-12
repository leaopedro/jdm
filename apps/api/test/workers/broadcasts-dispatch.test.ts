import { prisma } from '@jdm/db';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { runBroadcastDispatchTick } from '../../src/services/broadcasts/dispatch.js';
import { DevPushSender } from '../../src/services/push/dev.js';
import { createUser, resetDatabase } from '../helpers.js';

const TOKEN = 'ExponentPushToken[broadcasttest1]';

let userCounter = 0;
const uniqueEmail = (prefix: string) => `${prefix}-${++userCounter}@jdm.test`;

const seedAdmin = async () => {
  const { user } = await createUser({ role: 'admin', verified: true, email: uniqueEmail('admin') });
  return user;
};

const seedRecipient = async () => {
  const { user } = await createUser({ verified: true, email: uniqueEmail('recipient') });
  await prisma.deviceToken.create({
    data: { userId: user.id, expoPushToken: `${TOKEN}-${user.id.slice(0, 6)}`, platform: 'ios' },
  });
  return user;
};

describe('runBroadcastDispatchTick — draft vs dispatchable boundary', () => {
  beforeEach(async () => {
    await resetDatabase();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('does not claim a draft broadcast with null scheduledAt', async () => {
    const admin = await seedAdmin();
    await seedRecipient();

    const draft = await prisma.broadcast.create({
      data: {
        title: 'Draft only',
        body: 'should not be sent',
        targetKind: 'all',
        status: 'draft',
        scheduledAt: null,
        createdByAdminId: admin.id,
      },
    });

    const sender = new DevPushSender();
    await runBroadcastDispatchTick({ sender, now: new Date() });

    expect(sender.captured.length).toBe(0);
    const after = await prisma.broadcast.findUniqueOrThrow({ where: { id: draft.id } });
    expect(after.status).toBe('draft');
    expect(after.startedAt).toBeNull();
    expect(after.completedAt).toBeNull();
    const deliveries = await prisma.broadcastDelivery.count({ where: { broadcastId: draft.id } });
    expect(deliveries).toBe(0);
  });

  it('does not claim a scheduled broadcast whose scheduledAt is in the future', async () => {
    const admin = await seedAdmin();
    await seedRecipient();

    const future = new Date(Date.now() + 60 * 60 * 1000);
    const scheduled = await prisma.broadcast.create({
      data: {
        title: 'Future scheduled',
        body: 'wait for it',
        targetKind: 'all',
        status: 'scheduled',
        scheduledAt: future,
        createdByAdminId: admin.id,
      },
    });

    const sender = new DevPushSender();
    await runBroadcastDispatchTick({ sender, now: new Date() });

    expect(sender.captured.length).toBe(0);
    const after = await prisma.broadcast.findUniqueOrThrow({ where: { id: scheduled.id } });
    expect(after.status).toBe('scheduled');
    expect(after.startedAt).toBeNull();
  });

  it('claims and sends a scheduled broadcast whose scheduledAt is in the past', async () => {
    const admin = await seedAdmin();
    const recipient = await seedRecipient();

    const past = new Date(Date.now() - 60 * 1000);
    const scheduled = await prisma.broadcast.create({
      data: {
        title: 'Ready to send',
        body: 'go go go',
        targetKind: 'all',
        status: 'scheduled',
        scheduledAt: past,
        createdByAdminId: admin.id,
      },
    });

    const sender = new DevPushSender();
    await runBroadcastDispatchTick({ sender, now: new Date() });

    expect(sender.captured.length).toBeGreaterThanOrEqual(1);
    const after = await prisma.broadcast.findUniqueOrThrow({ where: { id: scheduled.id } });
    expect(after.status).toBe('sent');
    expect(after.startedAt).not.toBeNull();
    expect(after.completedAt).not.toBeNull();
    const delivery = await prisma.broadcastDelivery.findUniqueOrThrow({
      where: { broadcastId_userId: { broadcastId: scheduled.id, userId: recipient.id } },
    });
    expect(delivery.status).toBe('sent');
  });

  it('excludes recipients who opted out of marketing push', async () => {
    const admin = await seedAdmin();
    const recipient = await seedRecipient();
    await prisma.user.update({
      where: { id: recipient.id },
      data: { pushPrefs: { transactional: true, marketing: false } },
    });

    const past = new Date(Date.now() - 60 * 1000);
    const scheduled = await prisma.broadcast.create({
      data: {
        title: 'No opt-out users',
        body: 'should skip',
        targetKind: 'all',
        status: 'scheduled',
        scheduledAt: past,
        createdByAdminId: admin.id,
      },
    });

    const sender = new DevPushSender();
    await runBroadcastDispatchTick({ sender, now: new Date() });

    expect(sender.captured.length).toBe(0);
    const after = await prisma.broadcast.findUniqueOrThrow({ where: { id: scheduled.id } });
    expect(after.status).toBe('sent');
    const deliveries = await prisma.broadcastDelivery.count({
      where: { broadcastId: scheduled.id, userId: recipient.id },
    });
    expect(deliveries).toBe(0);
  });

  it('is idempotent — re-running the tick after a sent broadcast does not duplicate deliveries', async () => {
    const admin = await seedAdmin();
    const recipient = await seedRecipient();

    const past = new Date(Date.now() - 60 * 1000);
    const scheduled = await prisma.broadcast.create({
      data: {
        title: 'Idempotency check',
        body: 'once only',
        targetKind: 'all',
        status: 'scheduled',
        scheduledAt: past,
        createdByAdminId: admin.id,
      },
    });

    const sender = new DevPushSender();
    await runBroadcastDispatchTick({ sender, now: new Date() });
    const firstCount = sender.captured.length;
    await runBroadcastDispatchTick({ sender, now: new Date() });

    expect(sender.captured.length).toBe(firstCount);
    const deliveries = await prisma.broadcastDelivery.count({
      where: { broadcastId: scheduled.id, userId: recipient.id },
    });
    expect(deliveries).toBe(1);
  });
});
