import { prisma } from '@jdm/db';
import type { FastifyBaseLogger } from 'fastify';

import type { PushSender } from '../push/index.js';

import { resolveRecipients } from './targets.js';

const CHUNK = 100;

export type DispatchDeps = {
  sender: PushSender;
  batchSize?: number;
  log?: FastifyBaseLogger;
  now?: Date;
};

/**
 * Claim and dispatch one due broadcast per tick.
 * Idempotent: BroadcastDelivery rows guard against duplicate sends per (broadcastId, userId).
 */
export const runBroadcastDispatchTick = async (deps: DispatchDeps): Promise<void> => {
  const now = deps.now ?? new Date();
  const batchSize = deps.batchSize ?? CHUNK;
  const log = deps.log;

  // Only dispatch broadcasts that admins explicitly marked sendable.
  // Drafts are excluded — they require an explicit sendNow or scheduledAt
  // transition before a worker tick may claim them.
  const broadcast = await prisma.broadcast.findFirst({
    where: {
      status: 'scheduled',
      scheduledAt: { not: null, lte: now },
    },
    orderBy: { scheduledAt: 'asc' },
  });

  if (!broadcast) return;

  const claimed = await prisma.broadcast.updateMany({
    where: {
      id: broadcast.id,
      status: 'scheduled',
      scheduledAt: { not: null, lte: now },
    },
    data: { status: 'processing', startedAt: now },
  });

  if (claimed.count === 0) return;

  log?.info({ broadcastId: broadcast.id }, '[broadcasts] claimed broadcast for dispatch');

  try {
    const targetKind = broadcast.targetKind;
    const targetValue = broadcast.targetValue;

    type Target =
      | { kind: 'all' }
      | { kind: 'premium' }
      | { kind: 'attendees_of_event'; eventId: string }
      | { kind: 'city'; city: string };

    let target: Target;
    if (targetKind === 'attendees_of_event') {
      target = { kind: 'attendees_of_event', eventId: targetValue! };
    } else if (targetKind === 'city') {
      target = { kind: 'city', city: targetValue! };
    } else {
      target = { kind: targetKind };
    }

    const recipients = await resolveRecipients(target);

    // Insert delivery rows idempotently before sending
    await prisma.broadcastDelivery.createMany({
      data: recipients.map((r) => ({ broadcastId: broadcast.id, userId: r.userId })),
      skipDuplicates: true,
    });

    let totalSent = 0;
    let totalFailed = 0;

    for (let i = 0; i < recipients.length; i += batchSize) {
      const chunk = recipients.slice(i, i + batchSize);

      const messages = chunk.flatMap((r) =>
        r.tokens.map((token) => ({
          to: token,
          title: broadcast.title,
          body: broadcast.body,
          data: broadcast.data as Record<string, unknown>,
        })),
      );

      const result = await deps.sender.send(messages);

      // Track outcomes per user (use first token result as representative)
      const invalidTokens: string[] = [];
      for (const r of chunk) {
        const outcomes = r.tokens.map((t) => result.outcomesByToken.get(t));
        const hasSent = outcomes.some((o) => o?.kind === 'ok');
        const allInvalid = outcomes.every((o) => o?.kind === 'invalid-token');

        if (allInvalid) {
          invalidTokens.push(...r.tokens);
        }

        await prisma.broadcastDelivery.updateMany({
          where: { broadcastId: broadcast.id, userId: r.userId },
          data: {
            status: hasSent ? 'sent' : 'failed',
            sentAt: hasSent ? new Date() : null,
            attemptCount: { increment: 1 },
            lastAttemptAt: new Date(),
            failureCode: hasSent ? null : 'send_error',
            failureMessage: hasSent
              ? null
              : (outcomes.find((o) => o?.kind === 'error')?.message ?? null),
          },
        });

        if (hasSent) totalSent++;
        else totalFailed++;
      }

      // Prune invalid tokens
      if (invalidTokens.length > 0) {
        await prisma.deviceToken.deleteMany({
          where: { expoPushToken: { in: invalidTokens } },
        });
        log?.info({ count: invalidTokens.length }, '[broadcasts] pruned invalid tokens');
      }
    }

    await prisma.broadcast.update({
      where: { id: broadcast.id },
      data: { status: 'sent', completedAt: new Date() },
    });

    log?.info(
      { broadcastId: broadcast.id, totalSent, totalFailed },
      '[broadcasts] dispatch complete',
    );
  } catch (err) {
    await prisma.broadcast.update({
      where: { id: broadcast.id },
      data: { status: 'failed', completedAt: new Date() },
    });
    log?.error({ broadcastId: broadcast.id, err }, '[broadcasts] dispatch failed');
    throw err;
  }
};
