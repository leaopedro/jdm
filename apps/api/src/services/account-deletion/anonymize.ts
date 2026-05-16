import { randomBytes } from 'node:crypto';

import { prisma } from '@jdm/db';
import type { Prisma } from '@prisma/client';

import type { Uploads } from '../uploads/index.js';

type StepEntry = { step: string; status: 'ok' | 'error'; error?: string; at: string };

export type AnonymizeResult =
  | { ok: true; skipped?: boolean }
  | { ok: false; error: string };

export const anonymizeUser = async (userId: string, uploads: Uploads): Promise<AnonymizeResult> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { status: true, avatarObjectKey: true },
  });

  if (!user) return { ok: false, error: 'user_not_found' };
  if (user.status === 'anonymized') return { ok: true, skipped: true };
  if (user.status !== 'deleted') return { ok: false, error: 'user_not_deleted' };

  const steps: StepEntry[] = [];
  const now = new Date();

  // Collect R2 keys to delete
  const objectKeys: string[] = [];
  if (user.avatarObjectKey) objectKeys.push(user.avatarObjectKey);

  const carPhotos = await prisma.carPhoto.findMany({
    where: { car: { userId } },
    select: { objectKey: true },
  });
  objectKeys.push(...carPhotos.map((p) => p.objectKey));

  const feedPhotos = await prisma.feedPostPhoto.findMany({
    where: { post: { authorUserId: userId } },
    select: { objectKey: true },
  });
  objectKeys.push(...feedPhotos.map((p) => p.objectKey));

  const supportAttachments = await prisma.supportTicket.findMany({
    where: { userId, attachmentObjectKey: { not: null } },
    select: { attachmentObjectKey: true },
  });
  objectKeys.push(
    ...supportAttachments
      .map((s) => s.attachmentObjectKey)
      .filter((k): k is string => k !== null),
  );

  // Delete R2 objects (best-effort, log failures)
  for (const key of objectKeys) {
    try {
      await uploads.deleteObject(key);
      steps.push({ step: `r2_delete:${key}`, status: 'ok', at: new Date().toISOString() });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      steps.push({ step: `r2_delete:${key}`, status: 'error', error: msg, at: new Date().toISOString() });
    }
  }

  // Delete user-owned data (cars cascade to car_photos; feed posts cascade to photos)
  await prisma.car.deleteMany({ where: { userId } });
  steps.push({ step: 'delete_cars', status: 'ok', at: new Date().toISOString() });

  await prisma.deviceToken.deleteMany({ where: { userId } });
  steps.push({ step: 'delete_device_tokens', status: 'ok', at: new Date().toISOString() });

  await prisma.supportTicket.deleteMany({ where: { userId } });
  steps.push({ step: 'delete_support_tickets', status: 'ok', at: new Date().toISOString() });

  // Nullify feed authorship (preserve content, remove identity link)
  await prisma.feedPost.updateMany({ where: { authorUserId: userId }, data: { authorUserId: null } });
  await prisma.feedComment.updateMany({ where: { authorUserId: userId }, data: { authorUserId: null } });
  steps.push({ step: 'nullify_feed_authorship', status: 'ok', at: new Date().toISOString() });

  // Delete auth artifacts
  await prisma.authProvider.deleteMany({ where: { userId } });
  await prisma.mfaRecoveryCode.deleteMany({ where: { userId } });
  await prisma.mfaSecret.deleteMany({ where: { userId } });
  await prisma.refreshToken.deleteMany({ where: { userId } });
  await prisma.verificationToken.deleteMany({ where: { userId } });
  await prisma.passwordResetToken.deleteMany({ where: { userId } });
  await prisma.emailChangeToken.deleteMany({ where: { userId } });
  steps.push({ step: 'delete_auth_artifacts', status: 'ok', at: new Date().toISOString() });

  // Anonymize user row (keep row alive for fiscal FK on orders)
  const anonEmail = `deleted_${randomBytes(8).toString('hex')}@removed.local`;
  await prisma.user.update({
    where: { id: userId },
    data: {
      email: anonEmail,
      name: 'Deleted User',
      passwordHash: null,
      bio: null,
      city: null,
      stateCode: null,
      avatarObjectKey: null,
      status: 'anonymized',
      anonymizedAt: now,
      pushPrefs: { transactional: false, marketing: false } as unknown as Prisma.InputJsonValue,
    },
  });
  steps.push({ step: 'anonymize_user_row', status: 'ok', at: new Date().toISOString() });

  // Mark DeletionLog complete
  await prisma.deletionLog.update({
    where: { userId },
    data: {
      completedAt: now,
      steps: steps as unknown as Prisma.InputJsonValue,
    },
  });

  return { ok: true };
};
