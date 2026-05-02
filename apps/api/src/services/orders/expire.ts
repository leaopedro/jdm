import { prisma } from '@jdm/db';
import type { Prisma } from '@prisma/client';
import * as Sentry from '@sentry/node';

export const ORDER_EXPIRY_MS = 15 * 60 * 1000;

export type SweepResult = {
  count: number;
  expiredProviderRefs: string[];
};

/**
 * Within an existing transaction, expire all pending orders for `tierId` whose
 * `expiresAt` has passed, and atomically decrement `quantitySold` by the count.
 * Returns provider refs so the caller can cancel the Stripe PIs after the tx.
 */
export const sweepExpiredOrdersForTier = async (
  tierId: string,
  tx: Prisma.TransactionClient,
): Promise<SweepResult> => {
  const now = new Date();
  const expired = await tx.order.findMany({
    where: { tierId, status: 'pending', expiresAt: { not: null, lt: now } },
    select: { id: true, providerRef: true },
  });

  if (expired.length === 0) return { count: 0, expiredProviderRefs: [] };

  const expiredIds = expired.map((o) => o.id);

  await tx.order.updateMany({
    where: { id: { in: expiredIds } },
    data: { status: 'expired' },
  });
  await tx.ticketTier.updateMany({
    where: { id: tierId, quantitySold: { gte: expired.length } },
    data: { quantitySold: { decrement: expired.length } },
  });

  // Release extras stock for all swept orders
  const orderExtras = await tx.orderExtra.findMany({
    where: { orderId: { in: expiredIds } },
    select: { extraId: true, quantity: true },
  });
  const extraCounts = new Map<string, number>();
  for (const { extraId, quantity } of orderExtras) {
    extraCounts.set(extraId, (extraCounts.get(extraId) ?? 0) + quantity);
  }
  for (const [extraId, count] of extraCounts) {
    await tx.ticketExtra.updateMany({
      where: { id: extraId, quantitySold: { gte: count } },
      data: { quantitySold: { decrement: count } },
    });
  }

  Sentry.addBreadcrumb({
    category: 'orders.sweep',
    message: `Swept ${expired.length} expired pending order(s) for tier ${tierId}`,
    level: 'info',
    data: { tierId, count: expired.length },
  });

  return {
    count: expired.length,
    expiredProviderRefs: expired.flatMap((o) => (o.providerRef ? [o.providerRef] : [])),
  };
};

export type ExpiredOrderResult = {
  wasExpired: boolean;
  order: {
    id: string;
    userId: string;
    tierId: string;
    status: string;
    expiresAt: Date | null;
    amountCents: number;
    currency: string;
    providerRef: string | null;
  };
};

/**
 * Atomically expire a single pending order if its TTL has passed, releasing
 * `quantitySold`. Returns null if the order doesn't exist or isn't owned by
 * `ownerId` (safe 404 for route handlers).
 */
export const expireSingleOrder = async (
  orderId: string,
  ownerId: string,
): Promise<ExpiredOrderResult | null> => {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        userId: true,
        tierId: true,
        status: true,
        expiresAt: true,
        amountCents: true,
        currency: true,
        providerRef: true,
      },
    });
    if (!order || order.userId !== ownerId) return null;

    const isStale =
      order.status === 'pending' && order.expiresAt !== null && order.expiresAt < new Date();

    if (!isStale) return { wasExpired: false, order };

    await tx.order.updateMany({
      where: { id: orderId, status: 'pending' },
      data: { status: 'expired' },
    });
    await tx.ticketTier.updateMany({
      where: { id: order.tierId, quantitySold: { gt: 0 } },
      data: { quantitySold: { decrement: 1 } },
    });

    // Release extras stock
    const orderExtras = await tx.orderExtra.findMany({
      where: { orderId },
      select: { extraId: true, quantity: true },
    });
    for (const { extraId, quantity } of orderExtras) {
      await tx.ticketExtra.updateMany({
        where: { id: extraId, quantitySold: { gte: quantity } },
        data: { quantitySold: { decrement: quantity } },
      });
    }

    return { wasExpired: true, order: { ...order, status: 'expired' } };
  });
};
