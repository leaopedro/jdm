import { createHash, randomBytes } from 'node:crypto';

import { prisma } from '@jdm/db';

const VERIFY_TTL_MS = 24 * 3_600_000;

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

export const issueVerificationToken = async (userId: string): Promise<string> => {
  const token = randomBytes(32).toString('base64url');
  await prisma.verificationToken.create({
    data: {
      userId,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
    },
  });
  return token;
};

export const consumeVerificationToken = async (
  token: string,
): Promise<{ userId: string } | null> => {
  const hash = sha256(token);
  const record = await prisma.verificationToken.findUnique({ where: { tokenHash: hash } });
  if (!record) return null;
  if (record.consumedAt) return null;
  if (record.expiresAt.getTime() < Date.now()) return null;
  await prisma.$transaction([
    prisma.verificationToken.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: record.userId },
      data: { emailVerifiedAt: new Date() },
    }),
  ]);
  return { userId: record.userId };
};
