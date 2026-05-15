import { prisma } from '@jdm/db';
import type { ConsentChannel, ConsentPurpose } from '@prisma/client';

type RecordConsentParams = {
  userId: string;
  purpose: ConsentPurpose;
  version: string;
  channel: ConsentChannel;
  ipAddress: string | null;
  userAgent: string | null;
  evidence: Record<string, unknown>;
};

export const recordConsent = async (params: RecordConsentParams) => {
  const { userId, purpose, version, channel, ipAddress, userAgent, evidence } = params;

  return prisma.consent.upsert({
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
};

export const withdrawConsent = async (
  userId: string,
  purpose: ConsentPurpose,
): Promise<boolean> => {
  const row = await prisma.consent.findFirst({
    where: { userId, purpose, withdrawnAt: null },
    orderBy: { givenAt: 'desc' },
  });

  if (!row) return false;

  await prisma.consent.update({
    where: { id: row.id },
    data: { withdrawnAt: new Date() },
  });

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
