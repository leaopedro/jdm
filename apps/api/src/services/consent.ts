import { prisma } from '@jdm/db';
import type { ConsentChannel, ConsentPurpose, Prisma } from '@prisma/client';

type RecordConsentParams = {
  userId: string;
  purpose: ConsentPurpose;
  version: string;
  channel: ConsentChannel;
  ipAddress: string | null;
  userAgent: string | null;
  evidence: Prisma.InputJsonValue;
};

const syncPushMarketingPref = async (userId: string, enabled: boolean) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { pushPrefs: true },
  });
  if (!user) return;
  const current = (user.pushPrefs as Record<string, unknown>) ?? {};
  await prisma.user.update({
    where: { id: userId },
    data: {
      pushPrefs: { ...current, marketing: enabled } as Prisma.InputJsonValue,
    },
  });
};

export const recordConsent = async (params: RecordConsentParams) => {
  const { userId, purpose, version, channel, ipAddress, userAgent, evidence } = params;

  const row = await prisma.consent.upsert({
    where: {
      userId_purpose_version: { userId, purpose, version },
    },
    create: {
      userId,
      purpose,
      version,
      channel,
      ipAddress,
      userAgent,
      evidence,
    },
    update: {
      withdrawnAt: null,
      channel,
      ipAddress,
      userAgent,
      evidence,
    },
  });

  if (purpose === 'push_marketing') {
    await syncPushMarketingPref(userId, true);
  }

  return row;
};

export const withdrawConsent = async (
  userId: string,
  purpose: ConsentPurpose,
): Promise<boolean> => {
  const result = await prisma.consent.updateMany({
    where: { userId, purpose, withdrawnAt: null },
    data: { withdrawnAt: new Date() },
  });

  if (result.count === 0) return false;

  if (purpose === 'push_marketing') {
    await syncPushMarketingPref(userId, false);
  }

  return true;
};

export const hasActiveConsent = async (
  userId: string,
  purpose: ConsentPurpose,
): Promise<boolean> => {
  const count = await prisma.consent.count({
    where: { userId, purpose, withdrawnAt: null },
  });
  return count > 0;
};

export const listUserConsents = async (userId: string) => {
  return prisma.consent.findMany({
    where: { userId },
    orderBy: { givenAt: 'desc' },
    select: {
      id: true,
      purpose: true,
      version: true,
      givenAt: true,
      withdrawnAt: true,
      channel: true,
    },
  });
};
