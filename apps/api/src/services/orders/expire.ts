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
    select: { id: true, providerRef: true, kind: true },
  });

  if (expired.length === 0) return { count: 0, expiredProviderRefs: [] };

  const expiredIds = expired.map((o) => o.id);

  await tx.order.updateMany({
    where: { id: { in: expiredIds } },
    data: { status: 'expired' },
  });
  const ticketOrderCount = expired.filter((o) => o.kind !== 'extras_only').length;
  if (ticketOrderCount > 0) {
    await tx.ticketTier.updateMany({
      where: { id: tierId, quantitySold: { gte: ticketOrderCount } },
      data: { quantitySold: { decrement: ticketOrderCount } },
    });
  }

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

/**
 * Within an existing transaction, expire all pending product orders whose linked
 * `OrderItem(kind='product')` references `variantId` and whose `expiresAt` has passed,
 * atomically decrementing `Variant.quantitySold` by the released quantity.
 */
export const sweepExpiredOrdersForVariant = async (
  variantId: string,
  tx: Prisma.TransactionClient,
): Promise<SweepResult> => {
  const now = new Date();
  const expired = await tx.order.findMany({
    where: {
      status: 'pending',
      kind: 'product',
      expiresAt: { not: null, lt: now },
      items: { some: { kind: 'product', variantId } },
    },
    select: {
      id: true,
      providerRef: true,
      items: { where: { variantId }, select: { quantity: true } },
    },
  });

  if (expired.length === 0) return { count: 0, expiredProviderRefs: [] };

  const expiredIds = expired.map((o) => o.id);
  await tx.order.updateMany({
    where: { id: { in: expiredIds } },
    data: { status: 'expired' },
  });

  const releaseQuantity = expired.reduce(
    (sum, o) => sum + o.items.reduce((s, i) => s + i.quantity, 0),
    0,
  );
  if (releaseQuantity > 0) {
    await tx.variant.updateMany({
      where: { id: variantId, quantitySold: { gte: releaseQuantity } },
      data: { quantitySold: { decrement: releaseQuantity } },
    });
  }

  Sentry.addBreadcrumb({
    category: 'orders.sweep',
    message: `Swept ${expired.length} expired pending product order(s) for variant ${variantId}`,
    level: 'info',
    data: { variantId, count: expired.length },
  });

  return {
    count: expired.length,
    expiredProviderRefs: expired.flatMap((o) => (o.providerRef ? [o.providerRef] : [])),
  };
};

export type ExpireSingleOrderOutcome =
  | { kind: 'not_found' }
  | { kind: 'forbidden' }
  | {
      kind: 'ok';
      wasExpired: boolean;
      order: {
        id: string;
        userId: string;
        tierId: string | null;
        kind: string;
        status: string;
        expiresAt: Date | null;
        amountCents: number;
        currency: string;
        provider: 'stripe' | 'abacatepay';
        providerRef: string | null;
      };
    };

/**
 * Atomically expire a single pending order if its TTL has passed, releasing
 * `quantitySold`. Returns a discriminated outcome so the caller can split
 * 404 (missing) from 403 (non-owner).
 */
export const expireSingleOrder = async (
  orderId: string,
  ownerId: string,
): Promise<ExpireSingleOrderOutcome> => {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        userId: true,
        tierId: true,
        kind: true,
        status: true,
        expiresAt: true,
        amountCents: true,
        currency: true,
        provider: true,
        providerRef: true,
      },
    });
    if (!order) return { kind: 'not_found' };
    if (order.userId !== ownerId) return { kind: 'forbidden' };

    const isStale =
      order.status === 'pending' && order.expiresAt !== null && order.expiresAt < new Date();

    if (!isStale) return { kind: 'ok', wasExpired: false, order };

    await tx.order.updateMany({
      where: { id: orderId, status: 'pending' },
      data: { status: 'expired' },
    });
    if (order.kind === 'ticket' && order.tierId) {
      await tx.ticketTier.updateMany({
        where: { id: order.tierId, quantitySold: { gt: 0 } },
        data: { quantitySold: { decrement: 1 } },
      });
    } else if (order.kind === 'product') {
      const productItems = await tx.orderItem.findMany({
        where: { orderId, kind: 'product' },
        select: { variantId: true, quantity: true },
      });
      for (const { variantId, quantity } of productItems) {
        if (!variantId) continue;
        await tx.variant.updateMany({
          where: { id: variantId, quantitySold: { gte: quantity } },
          data: { quantitySold: { decrement: quantity } },
        });
      }
    }

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

    return { kind: 'ok', wasExpired: true, order: { ...order, status: 'expired' } };
  });
};
