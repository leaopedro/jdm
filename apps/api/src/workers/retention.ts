import { prisma } from '@jdm/db';
import type { FastifyBaseLogger } from 'fastify';
import cron from 'node-cron';

import { recordAudit } from '../services/admin-audit.js';

type PurgeResult = { table: string; deletedCount: number; skippedHolds: number };

const MS_PER_DAY = 24 * 3600_000;

export type RetentionWorkerDeps = {
  now?: Date;
  log?: FastifyBaseLogger;
};

async function purgeExpiredRefreshTokens(now: Date): Promise<PurgeResult> {
  const cutoff = new Date(now.getTime() - 7 * MS_PER_DAY);
  const { count } = await prisma.refreshToken.deleteMany({
    where: { expiresAt: { lt: cutoff } },
  });
  return { table: 'RefreshToken', deletedCount: count, skippedHolds: 0 };
}

async function purgeConsumedVerificationTokens(now: Date): Promise<PurgeResult> {
  const { count } = await prisma.verificationToken.deleteMany({
    where: {
      OR: [{ expiresAt: { lt: now } }, { consumedAt: { not: null } }],
    },
  });
  return { table: 'VerificationToken', deletedCount: count, skippedHolds: 0 };
}

async function purgeConsumedPasswordResetTokens(now: Date): Promise<PurgeResult> {
  const { count } = await prisma.passwordResetToken.deleteMany({
    where: {
      OR: [{ expiresAt: { lt: now } }, { consumedAt: { not: null } }],
    },
  });
  return { table: 'PasswordResetToken', deletedCount: count, skippedHolds: 0 };
}

async function purgeOldPaymentWebhookEvents(now: Date): Promise<PurgeResult> {
  const cutoff = new Date(now.getTime() - 90 * MS_PER_DAY);

  const holdCount = await prisma.paymentWebhookEvent.count({
    where: {
      createdAt: { lt: cutoff },
      retentionHoldUntil: { gte: now },
    },
  });

  const { count } = await prisma.paymentWebhookEvent.deleteMany({
    where: {
      createdAt: { lt: cutoff },
      OR: [{ retentionHoldUntil: null }, { retentionHoldUntil: { lt: now } }],
    },
  });
  return { table: 'PaymentWebhookEvent', deletedCount: count, skippedHolds: holdCount };
}

async function purgeOldNotifications(now: Date): Promise<PurgeResult> {
  const cutoff = new Date(now.getTime() - 90 * MS_PER_DAY);
  const { count } = await prisma.notification.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return { table: 'Notification', deletedCount: count, skippedHolds: 0 };
}

async function purgeOldBroadcastDeliveries(now: Date): Promise<PurgeResult> {
  const cutoff = new Date(now.getTime() - 365 * MS_PER_DAY);
  const { count } = await prisma.broadcastDelivery.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return { table: 'BroadcastDelivery', deletedCount: count, skippedHolds: 0 };
}

const PURGE_JOBS = [
  purgeExpiredRefreshTokens,
  purgeConsumedVerificationTokens,
  purgeConsumedPasswordResetTokens,
  purgeOldPaymentWebhookEvents,
  purgeOldNotifications,
  purgeOldBroadcastDeliveries,
] as const;

export const runRetentionTick = async (deps: RetentionWorkerDeps): Promise<PurgeResult[]> => {
  const now = deps.now ?? new Date();
  const results: PurgeResult[] = [];

  for (const job of PURGE_JOBS) {
    const result = await job(now);
    results.push(result);

    if (result.deletedCount > 0 || result.skippedHolds > 0) {
      deps.log?.info(
        { table: result.table, deleted: result.deletedCount, skippedHolds: result.skippedHolds },
        '[retention] purged',
      );
    }
  }

  await recordAudit({
    actorId: 'system:retention',
    action: 'retention.purge',
    entityType: 'retention_run',
    entityId: now.toISOString().slice(0, 10),
    metadata: Object.fromEntries(
      results.map((r) => [r.table, { deleted: r.deletedCount, skippedHolds: r.skippedHolds }]),
    ),
  });

  return results;
};

export const startRetentionWorker = (deps: { log: FastifyBaseLogger }): { stop: () => void } => {
  const task = cron.schedule(
    '0 2 * * *',
    () => {
      void runRetentionTick({ log: deps.log }).catch((err: unknown) => {
        deps.log.error({ err }, '[retention] tick failed');
      });
    },
    { timezone: 'America/Sao_Paulo' },
  );
  return {
    stop: () => {
      void task.stop();
    },
  };
};
