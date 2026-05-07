import { prisma } from '@jdm/db';
import type { Prisma } from '@prisma/client';

import { ORDER_EXPIRY_MS, sweepExpiredOrdersForTier } from '../orders/expire.js';
import { reserveExtras, validateTickets } from '../orders/validate-tickets.js';

type _CartItemWithExtras = Prisma.CartItemGetPayload<{
  include: {
    extras: true;
    tier: {
      select: {
        priceCents: true;
        currency: true;
        requiresCar: true;
        quantityTotal: true;
        quantitySold: true;
      };
    };
  };
}>;

type CartWithItems = Prisma.CartGetPayload<{
  include: {
    items: {
      include: {
        extras: true;
        tier: {
          select: {
            priceCents: true;
            currency: true;
            requiresCar: true;
            quantityTotal: true;
            quantitySold: true;
          };
        };
      };
    };
  };
}>;

export type CartOrder = {
  id: string;
  eventId: string;
  tierId: string;
  amountCents: number;
  quantity: number;
  kind: 'ticket' | 'extras_only';
};

export type CheckoutResult = {
  cartId: string;
  orders: CartOrder[];
  totalAmountCents: number;
  currency: string;
  expiredProviderRefs: string[];
};

const CART_CHECKOUT_INCLUDE = {
  items: {
    include: {
      extras: true,
      tier: {
        select: {
          priceCents: true,
          currency: true,
          requiresCar: true,
          quantityTotal: true,
          quantitySold: true,
        },
      },
    },
  },
} satisfies Prisma.CartInclude;

export async function loadCartForCheckout(
  userId: string,
): Promise<
  { ok: true; cart: CartWithItems } | { ok: false; status: number; error: string; message: string }
> {
  const cart = await prisma.cart.findFirst({
    where: { userId, status: { in: ['open', 'checking_out'] } },
    include: CART_CHECKOUT_INCLUDE,
    orderBy: { updatedAt: 'desc' },
  });

  if (!cart || cart.items.length === 0) {
    return { ok: false, status: 422, error: 'UnprocessableEntity', message: 'cart is empty' };
  }

  return { ok: true, cart };
}

export type CartCheckoutMethod = 'card' | 'pix';

const PROVIDER_FOR_METHOD: Record<CartCheckoutMethod, 'stripe' | 'abacatepay'> = {
  card: 'stripe',
  pix: 'abacatepay',
};

export async function reserveAndCreateOrders(
  cart: CartWithItems,
  userId: string,
  options: { method: CartCheckoutMethod } = { method: 'card' },
): Promise<
  { ok: true; data: CheckoutResult } | { ok: false; status: number; error: string; message: string }
> {
  const method = options.method;
  const provider = PROVIDER_FOR_METHOD[method];
  const allExpiredRefs: string[] = [];

  try {
    const result = await prisma.$transaction(async (tx) => {
      const orders: CartOrder[] = [];

      for (const item of cart.items) {
        const isExtrasOnly = item.kind === 'extras_only';
        const tickets = item.tickets as Array<{
          carId?: string;
          licensePlate?: string;
          extras?: string[];
        }>;

        if (!item.tierId || !item.eventId) {
          throw Object.assign(new Error('cart item missing eventId/tierId'), {
            code: 'CART_ITEM_INVALID',
          });
        }

        const tier = await tx.ticketTier.findUniqueOrThrow({
          where: { id: item.tierId },
          select: {
            id: true,
            requiresCar: true,
            quantityTotal: true,
            quantitySold: true,
            priceCents: true,
            currency: true,
            eventId: true,
          },
        });

        const sweep = await sweepExpiredOrdersForTier(tier.id, tx);
        allExpiredRefs.push(...sweep.expiredProviderRefs);

        if (!isExtrasOnly) {
          const reservation = await tx.ticketTier.updateMany({
            where: { id: tier.id, quantitySold: { lte: tier.quantityTotal - item.quantity } },
            data: { quantitySold: { increment: item.quantity } },
          });
          if (reservation.count === 0) {
            throw Object.assign(new Error(`tier ${tier.id} sold out`), {
              code: 'TIER_SOLD_OUT',
              tierId: tier.id,
            });
          }
        }

        const ticketInputs = tickets.map((t) => ({
          extras: t.extras ?? [],
          carId: t.carId,
          licensePlate: t.licensePlate,
        }));

        const validation = await validateTickets(
          ticketInputs,
          { requiresCar: tier.requiresCar },
          item.eventId,
          tx,
          userId,
          { skipCarValidation: isExtrasOnly },
        );

        await reserveExtras(validation.extraStock, tx);

        const expiresAt = new Date(Date.now() + ORDER_EXPIRY_MS);
        const order = await tx.order.create({
          data: {
            userId,
            eventId: item.eventId,
            tierId: item.tierId,
            cartId: cart.id,
            kind: isExtrasOnly ? 'extras_only' : 'ticket',
            amountCents: item.amountCents,
            quantity: item.quantity,
            currency: tier.currency,
            method,
            provider,
            status: 'pending',
            expiresAt,
          },
        });

        if (validation.extraEntries.length > 0) {
          await tx.orderExtra.createMany({
            data: validation.extraEntries.map(({ extraId, quantity }) => ({
              orderId: order.id,
              extraId,
              quantity,
            })),
            skipDuplicates: true,
          });
        }

        orders.push({
          id: order.id,
          eventId: item.eventId,
          tierId: item.tierId,
          amountCents: item.amountCents,
          quantity: item.quantity,
          kind: isExtrasOnly ? 'extras_only' : 'ticket',
        });
      }

      const cartGuard = await tx.cart.updateMany({
        where: { id: cart.id, status: 'open' },
        data: { status: 'checking_out' },
      });
      if (cartGuard.count === 0) {
        throw Object.assign(new Error('cart is already checking out'), {
          code: 'CART_ALREADY_CHECKING_OUT',
        });
      }

      return orders;
    });

    const totalAmountCents = result.reduce((sum, o) => sum + o.amountCents, 0);

    return {
      ok: true,
      data: {
        cartId: cart.id,
        orders: result,
        totalAmountCents,
        currency: 'BRL',
        expiredProviderRefs: allExpiredRefs,
      },
    };
  } catch (err) {
    const coded = err as Error & { code?: string };
    if (coded.code === 'TIER_SOLD_OUT') {
      return { ok: false, status: 409, error: 'Conflict', message: coded.message };
    }
    if (coded.code === 'EXTRA_SOLD_OUT') {
      return { ok: false, status: 409, error: 'Conflict', message: coded.message };
    }
    if (coded.code === 'CART_ALREADY_CHECKING_OUT' || coded.code === 'CART_ITEM_INVALID') {
      return { ok: false, status: 409, error: 'Conflict', message: coded.message };
    }
    throw err;
  }
}

export async function rollbackCartCheckout(cartId: string, orders: CartOrder[]): Promise<void> {
  await prisma.$transaction(async (tx) => {
    for (const order of orders) {
      if (order.kind !== 'extras_only') {
        await tx.ticketTier.updateMany({
          where: { id: order.tierId, quantitySold: { gte: order.quantity } },
          data: { quantitySold: { decrement: order.quantity } },
        });
      }

      const orderExtras = await tx.orderExtra.findMany({
        where: { orderId: order.id },
        select: { extraId: true, quantity: true },
      });
      for (const { extraId, quantity } of orderExtras) {
        await tx.ticketExtra.updateMany({
          where: { id: extraId, quantitySold: { gte: quantity } },
          data: { quantitySold: { decrement: quantity } },
        });
      }

      await tx.orderExtra.deleteMany({ where: { orderId: order.id } });
      await tx.order.delete({ where: { id: order.id } });
    }

    await tx.cart.update({
      where: { id: cartId },
      data: { status: 'open' },
    });
  });
}
