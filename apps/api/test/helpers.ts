import { prisma } from '@jdm/db';

import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/env.js';
import { buildFakeAbacatePay, type FakeAbacatePay } from '../src/services/abacatepay/fake.js';
import { hashPassword } from '../src/services/auth/password.js';
import { createAccessToken } from '../src/services/auth/tokens.js';
import { buildFakeStripe, type FakeStripe } from '../src/services/stripe/fake.js';

export const makeApp = () => buildApp(loadEnv());

export const makeAppWithFakeStripe = async (): Promise<{
  app: Awaited<ReturnType<typeof buildApp>>;
  stripe: FakeStripe;
}> => {
  const stripe = buildFakeStripe();
  const app = await buildApp(loadEnv(), { stripe });
  return { app, stripe };
};

export const makeAppWithFakes = async (): Promise<{
  app: Awaited<ReturnType<typeof buildApp>>;
  stripe: FakeStripe;
  abacatepay: FakeAbacatePay;
}> => {
  const stripe = buildFakeStripe();
  const abacatepay = buildFakeAbacatePay();
  const app = await buildApp(loadEnv(), { stripe, abacatepay });
  return { app, stripe, abacatepay };
};

export const resetDatabase = async (): Promise<void> => {
  await prisma.broadcastDelivery.deleteMany();
  await prisma.broadcast.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.deviceToken.deleteMany();
  await prisma.cartItemExtra.deleteMany();
  await prisma.cartItem.deleteMany();
  await prisma.cart.deleteMany();
  await prisma.pickupVoucher.deleteMany();
  await prisma.ticketExtraItem.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.orderExtra.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.shippingAddress.deleteMany();
  await prisma.ticketExtra.deleteMany();
  await prisma.paymentWebhookEvent.deleteMany();
  await prisma.adminAudit.deleteMany();
  await prisma.productCollection.deleteMany();
  await prisma.collection.deleteMany();
  await prisma.productPhoto.deleteMany();
  await prisma.variant.deleteMany();
  await prisma.product.deleteMany();
  await prisma.productType.deleteMany();
  await prisma.shippingAddress.deleteMany();
  await prisma.ticketTier.deleteMany();
  await prisma.event.deleteMany();
  await prisma.carPhoto.deleteMany();
  await prisma.car.deleteMany();
  await prisma.productCollection.deleteMany();
  await prisma.collection.deleteMany();
  await prisma.variant.deleteMany();
  await prisma.productPhoto.deleteMany();
  await prisma.product.deleteMany();
  await prisma.productType.deleteMany();
  await prisma.storeSettings.deleteMany();
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
    role: 'user' | 'organizer' | 'admin' | 'staff';
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
  role: 'user' | 'organizer' | 'admin' | 'staff' = 'user',
) => `Bearer ${createAccessToken({ sub: userId, role }, env)}`;
