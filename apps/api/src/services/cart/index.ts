import { prisma } from '@jdm/db';
import type { Cart, CartItem, CartItemInput, CartTotals, EvictedCartItem } from '@jdm/shared/cart';
import type { Prisma } from '@prisma/client';

type CartWithItems = Prisma.CartGetPayload<{
  include: {
    items: {
      include: {
        extras: true;
        tier: { select: { priceCents: true; currency: true } };
      };
    };
  };
}>;

const CART_INCLUDE = {
  items: {
    include: {
      extras: true,
      tier: { select: { priceCents: true, currency: true } },
    },
  },
} satisfies Prisma.CartInclude;

export async function getActiveCart(userId: string): Promise<CartWithItems | null> {
  return prisma.cart.findFirst({
    where: { userId, status: 'open' },
    include: CART_INCLUDE,
  });
}

export async function getOrCreateCart(userId: string): Promise<CartWithItems> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const existing = await tx.cart.findFirst({
            where: { userId, status: 'open' },
            include: CART_INCLUDE,
          });
          if (existing) return existing;
          return tx.cart.create({
            data: { userId, status: 'open' },
            include: CART_INCLUDE,
          });
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (err: unknown) {
      const code = err instanceof Error && 'code' in err ? (err as { code: string }).code : '';
      if (code === 'P2034' || code === 'P2002') {
        const found = await prisma.cart.findFirst({
          where: { userId, status: 'open' },
          include: CART_INCLUDE,
        });
        if (found) return found;
        continue;
      }
      throw err;
    }
  }
  throw new Error('Failed to get or create cart after retries');
}

export function computeItemAmount(
  tier: { priceCents: number },
  quantity: number,
  extras: { subtotalCents: number }[],
): number {
  const tierTotal = tier.priceCents * quantity;
  const extrasTotal = extras.reduce((sum, e) => sum + e.subtotalCents, 0);
  return tierTotal + extrasTotal;
}

export function computeCartTotals(items: CartWithItems['items']): CartTotals {
  let ticketSubtotalCents = 0;
  let extrasSubtotalCents = 0;

  for (const item of items) {
    if (item.kind === 'ticket') {
      ticketSubtotalCents += item.tier.priceCents * item.quantity;
    }
    for (const extra of item.extras) {
      extrasSubtotalCents += extra.subtotalCents;
    }
  }

  const discountCents = 0;
  const amountCents = ticketSubtotalCents + extrasSubtotalCents - discountCents;

  return {
    ticketSubtotalCents,
    extrasSubtotalCents,
    discountCents,
    amountCents,
    currency: 'BRL',
  };
}

export function serializeCart(cart: CartWithItems): Cart {
  const items: CartItem[] = cart.items.map((item) => ({
    id: item.id,
    eventId: item.eventId,
    tierId: item.tierId,
    source: item.source as 'purchase',
    kind: item.kind as CartItem['kind'],
    quantity: item.quantity,
    tickets: item.tickets as CartItem['tickets'],
    extras: item.extras.map((e) => ({
      extraId: e.extraId,
      quantity: e.quantity,
      unitPriceCents: e.unitPriceCents,
      subtotalCents: e.subtotalCents,
    })),
    amountCents: item.amountCents,
    currency: item.currency,
    reservationExpiresAt: item.reservationExpiresAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  }));

  const totals = computeCartTotals(cart.items);

  return {
    id: cart.id,
    userId: cart.userId,
    status: cart.status as Cart['status'],
    items,
    totals,
    version: cart.version,
    expiresAt: cart.expiresAt?.toISOString() ?? null,
    createdAt: cart.createdAt.toISOString(),
    updatedAt: cart.updatedAt.toISOString(),
  };
}

export async function evictStaleItems(cart: CartWithItems): Promise<EvictedCartItem[]> {
  const evicted: EvictedCartItem[] = [];
  const idsToDelete: string[] = [];

  for (const item of cart.items) {
    const event = await prisma.event.findUnique({
      where: { id: item.eventId },
      select: { status: true },
    });

    if (!event || event.status !== 'published') {
      const reason = event?.status === 'cancelled' ? 'event_cancelled' : 'event_unpublished';
      evicted.push({
        itemId: item.id,
        reason,
        message: `Event is ${reason === 'event_cancelled' ? 'cancelled' : 'no longer published'}`,
      });
      idsToDelete.push(item.id);
      continue;
    }

    const tier = await prisma.ticketTier.findUnique({
      where: { id: item.tierId },
      select: { id: true, eventId: true },
    });

    if (!tier || tier.eventId !== item.eventId) {
      evicted.push({
        itemId: item.id,
        reason: 'tier_removed',
        message: 'Ticket tier is no longer available',
      });
      idsToDelete.push(item.id);
      continue;
    }

    let extraStale = false;
    for (const cartExtra of item.extras) {
      const extra = await prisma.ticketExtra.findUnique({
        where: { id: cartExtra.extraId },
        select: { id: true, eventId: true, active: true, quantityTotal: true, quantitySold: true },
      });

      if (!extra || extra.eventId !== item.eventId || !extra.active) {
        evicted.push({
          itemId: item.id,
          reason: 'extra_removed',
          message: `Extra ${cartExtra.extraId} is no longer available`,
        });
        idsToDelete.push(item.id);
        extraStale = true;
        break;
      }

      if (
        extra.quantityTotal !== null &&
        extra.quantityTotal - extra.quantitySold < cartExtra.quantity
      ) {
        evicted.push({
          itemId: item.id,
          reason: 'extra_sold_out',
          message: `Extra ${cartExtra.extraId} is sold out`,
        });
        idsToDelete.push(item.id);
        extraStale = true;
        break;
      }
    }
    if (extraStale) continue;
  }

  if (idsToDelete.length > 0) {
    await prisma.cartItem.deleteMany({
      where: { id: { in: idsToDelete } },
    });
    console.log('cart.evict', { cartId: cart.id, evicted: idsToDelete.length });
  }

  return evicted;
}

function codedError(
  message: string,
  code: string,
  status: number,
): Error & { code: string; statusCode: number } {
  return Object.assign(new Error(message), { code, statusCode: status });
}

export async function validateCartItem(
  input: CartItemInput,
  userId: string,
  excludeCartItemId?: string,
): Promise<{
  event: { id: string; maxTicketsPerUser: number };
  tier: { id: string; priceCents: number; currency: string; requiresCar: boolean };
}> {
  const event = await prisma.event.findFirst({
    where: { id: input.eventId, status: 'published' },
    select: { id: true, maxTicketsPerUser: true },
  });
  if (!event) {
    throw codedError('Event not found or not published', 'EVENT_NOT_FOUND', 404);
  }

  const tier = await prisma.ticketTier.findFirst({
    where: { id: input.tierId, eventId: input.eventId },
    select: {
      id: true,
      priceCents: true,
      currency: true,
      quantityTotal: true,
      quantitySold: true,
      requiresCar: true,
    },
  });
  if (!tier) {
    throw codedError('Tier not found for this event', 'TIER_NOT_FOUND', 404);
  }

  const available = tier.quantityTotal - tier.quantitySold;
  if (available < input.quantity) {
    throw codedError(`Only ${available} ticket(s) remaining`, 'TIER_SOLD_OUT', 409);
  }

  const existingTickets = await prisma.ticket.count({
    where: {
      userId,
      eventId: input.eventId,
      status: { in: ['valid', 'used'] },
    },
  });

  const pendingWhere: Prisma.CartItemWhereInput = {
    cart: { userId, status: 'open' },
    eventId: input.eventId,
    kind: 'ticket',
    ...(excludeCartItemId ? { id: { not: excludeCartItemId } } : {}),
  };
  const pendingCartItems = await prisma.cartItem.aggregate({
    _sum: { quantity: true },
    where: pendingWhere,
  });
  const pendingQty = pendingCartItems._sum.quantity ?? 0;

  const totalAfter = existingTickets + pendingQty + input.quantity;
  if (totalAfter > event.maxTicketsPerUser) {
    throw codedError(
      `Exceeds max ${event.maxTicketsPerUser} ticket(s) per user for this event`,
      'MAX_TICKETS_EXCEEDED',
      409,
    );
  }

  if (input.tickets.length !== input.quantity) {
    throw codedError(
      `tickets array length (${input.tickets.length}) must equal quantity (${input.quantity})`,
      'TICKETS_QUANTITY_MISMATCH',
      400,
    );
  }

  const allExtraIds = new Set<string>();
  for (const ticket of input.tickets) {
    for (const extraId of ticket.extras) {
      allExtraIds.add(extraId);
    }
  }

  if (allExtraIds.size > 0) {
    const extras = await prisma.ticketExtra.findMany({
      where: { id: { in: [...allExtraIds] } },
      select: { id: true, eventId: true, active: true, quantityTotal: true, quantitySold: true },
    });
    const extrasById = new Map(extras.map((e) => [e.id, e]));

    const extraCounts = new Map<string, number>();
    for (const ticket of input.tickets) {
      for (const extraId of ticket.extras) {
        extraCounts.set(extraId, (extraCounts.get(extraId) ?? 0) + 1);
      }
    }

    for (const [extraId, count] of extraCounts) {
      const extra = extrasById.get(extraId);
      if (!extra || extra.eventId !== input.eventId) {
        throw codedError(`Extra ${extraId} not found for this event`, 'EXTRA_NOT_FOUND', 404);
      }
      if (!extra.active) {
        throw codedError(`Extra ${extraId} is not active`, 'EXTRA_NOT_ACTIVE', 409);
      }
      if (extra.quantityTotal !== null && extra.quantityTotal - extra.quantitySold < count) {
        throw codedError(`Extra ${extraId} is sold out`, 'EXTRA_SOLD_OUT', 409);
      }
    }
  }

  return {
    event: { id: event.id, maxTicketsPerUser: event.maxTicketsPerUser },
    tier: {
      id: tier.id,
      priceCents: tier.priceCents,
      currency: tier.currency,
      requiresCar: tier.requiresCar,
    },
  };
}
