import { prisma } from '@jdm/db';

import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/env.js';
import { hashPassword } from '../src/services/auth/password.js';
import { createAccessToken } from '../src/services/auth/tokens.js';

export const makeApp = () => buildApp(loadEnv());

export const resetDatabase = async (): Promise<void> => {
  await prisma.ticket.deleteMany();
  await prisma.order.deleteMany();
  await prisma.paymentWebhookEvent.deleteMany();
  await prisma.adminAudit.deleteMany();
  await prisma.ticketTier.deleteMany();
  await prisma.event.deleteMany();
  await prisma.carPhoto.deleteMany();
  await prisma.car.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.verificationToken.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.authProvider.deleteMany();
  await prisma.user.deleteMany();
};

export const createUser = async (
  overrides: Partial<{
    email: string;
    password: string;
    name: string;
    verified: boolean;
    role: 'user' | 'organizer' | 'admin';
  }> = {},
) => {
  const password = overrides.password ?? 'correct-horse-battery-staple';
  const user = await prisma.user.create({
    data: {
      email: overrides.email ?? 'user@jdm.test',
      name: overrides.name ?? 'Test User',
      passwordHash: await hashPassword(password),
      role: overrides.role ?? 'user',
      emailVerifiedAt: overrides.verified ? new Date() : null,
    },
  });
  return { user, password };
};

export const bearer = (
  env: ReturnType<typeof loadEnv>,
  userId: string,
  role: 'user' | 'organizer' | 'admin' = 'user',
) => `Bearer ${createAccessToken({ sub: userId, role }, env)}`;
