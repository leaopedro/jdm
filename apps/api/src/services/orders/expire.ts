import { prisma } from '@jdm/db';
import type { Prisma } from '@prisma/client';
import * as Sentry from '@sentry/node';

export const ORDER_EXPIRY_MS = 15 * 60 * 1000;

export type SweepResult = {
  count: number;
  expiredProviderRefs: string[];
};

/**
 * Releases every stock reservation held by `orderIds`: ticket tiers, product
 * variants, and ticket extras. Reads from `OrderItem` and `OrderExtra` so it
 * handles `ticket`, `product`, `extras_only`, and `mixed` orders uniformly.
 * Caller is responsible for first flipping the orders to `expired`.
 */
const releaseAllReservationsForOrders = async (
  tx: Prisma.TransactionClient,
  orderIds: string[],
): Promise<void> => {
  if (orderIds.length === 0) return;

  const items = await tx.orderItem.findMany({
    where: { orderId: { in: orderIds } },
    select: { kind: true, tierId: true, variantId: true, quantity: true },
  });

  const tierReleases = new Map<string, number>();
  const variantReleases = new Map<string, number>();
  for (const it of items) {
    if (it.kind === 'ticket' && it.tierId) {
      tierReleases.set(it.tierId, (tierReleases.get(it.tierId) ?? 0) + it.quantity);
    } else if (it.kind === 'product' && it.variantId) {
      variantReleases.set(it.variantId, (variantReleases.get(it.variantId) ?? 0) + it.quantity);
    }
  }
  for (const [tierId, qty] of tierReleases) {
    await tx.ticketTier.updateMany({
      where: { id: tierId, quantitySold: { gte: qty } },
      data: { quantitySold: { decrement: qty } },
    });
  }
  for (const [variantId, qty] of variantReleases) {
    await tx.variant.updateMany({
      where: { id: variantId, quantitySold: { gte: qty } },
      data: { quantitySold: { decrement: qty } },
    });
  }

  const orderExtras = await tx.orderExtra.findMany({
    where: { orderId: { in: orderIds } },
    select: { extraId: true, quantity: true },
  });
  const extraReleases = new Map<string, number>();
  for (const { extraId, quantity } of orderExtras) {
    extraReleases.set(extraId, (extraReleases.get(extraId) ?? 0) + quantity);
  }
  for (const [extraId, count] of extraReleases) {
    await tx.ticketExtra.updateMany({
      where: { id: extraId, quantitySold: { gte: count } },
      data: { quantitySold: { decrement: count } },
    });
  }
};

/**
 * Within an existing transaction, expire all pending orders that hold a
 * `ticket`-kind `OrderItem` for `tierId` and whose `expiresAt` has passed.
 * Releases every reservation held by those orders (ticket tier, variant,
 * extras), so mixed orders that pinned multiple kinds are fully unwound.
 * Returns provider refs so the caller can cancel the Stripe PIs after the tx.
 */
export const sweepExpiredOrdersForTier = async (
  tierId: string,
  tx: Prisma.TransactionClient,
): Promise<SweepResult> => {
  const now = new Date();
  const expired = await tx.order.findMany({
    where: {
      status: 'pending',
      expiresAt: { not: null, lt: now },
      items: { some: { kind: 'ticket', tierId } },
    },
    select: { id: true, providerRef: true },
  });

  if (expired.length === 0) return { count: 0, expiredProviderRefs: [] };

  const expiredIds = expired.map((o) => o.id);

  await tx.order.updateMany({
    where: { id: { in: expiredIds } },
    data: { status: 'expired' },
  });

  await releaseAllReservationsForOrders(tx, expiredIds);

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
 * Within an existing transaction, expire all pending orders that hold a
 * `product`-kind `OrderItem` for `variantId` and whose `expiresAt` has passed.
 * Releases every reservation held by those orders (variant, ticket tier,
 * extras), so mixed orders that pinned multiple kinds are fully unwound.
 */
export const sweepExpiredOrdersForVariant = async (
  variantId: string,
  tx: Prisma.TransactionClient,
): Promise<SweepResult> => {
  const now = new Date();
  const expired = await tx.order.findMany({
    where: {
      status: 'pending',
      expiresAt: { not: null, lt: now },
      items: { some: { kind: 'product', variantId } },
    },
    select: { id: true, providerRef: true },
  });

  if (expired.length === 0) return { count: 0, expiredProviderRefs: [] };

  const expiredIds = expired.map((o) => o.id);
  await tx.order.updateMany({
    where: { id: { in: expiredIds } },
    data: { status: 'expired' },
  });

  await releaseAllReservationsForOrders(tx, expiredIds);

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
 * every reservation it holds (ticket tier, variant, extras) regardless of
 * `Order.kind` — mixed orders are unwound the same way as ticket/product
 * orders. Returns a discriminated outcome so the caller can split 404
 * (missing) from 403 (non-owner).
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

    await releaseAllReservationsForOrders(tx, [orderId]);

    return { kind: 'ok', wasExpired: true, order: { ...order, status: 'expired' } };
  });
};
