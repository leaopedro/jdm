import { prisma } from '@jdm/db';
import {
  getCartResponseSchema,
  upsertCartItemRequestSchema,
  upsertCartItemResponseSchema,
  clearCartResponseSchema,
} from '@jdm/shared/cart';
import type { FastifyPluginAsync } from 'fastify';

import { requireUser } from '../plugins/auth.js';
import {
  computeItemAmount,
  evictStaleItems,
  getActiveCart,
  getOrCreateCart,
  serializeCart,
  validateCartItem,
} from '../services/cart/index.js';

// eslint-disable-next-line @typescript-eslint/require-await
export const cartRoutes: FastifyPluginAsync = async (app) => {
  // GET /cart
  app.get('/cart', { preHandler: [app.authenticate] }, async (request) => {
    const { sub } = requireUser(request);
    const cart = await getActiveCart(sub);

    if (!cart) {
      return getCartResponseSchema.parse({
        cart: null,
        stockWarnings: [],
        evictedItems: [],
        flags: { cartV1: true },
      });
    }

    const evictedItems = await evictStaleItems(cart);

    const freshCart = evictedItems.length > 0 ? await getActiveCart(sub) : cart;

    return getCartResponseSchema.parse({
      cart: freshCart ? serializeCart(freshCart) : null,
      stockWarnings: [],
      evictedItems,
      flags: { cartV1: true },
    });
  });

  // POST /cart/items
  app.post('/cart/items', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { sub } = requireUser(request);
    const { item: input } = upsertCartItemRequestSchema.parse(request.body);

    let validated;
    try {
      validated = await validateCartItem(input, sub);
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number; code?: string };
      const status = e.statusCode ?? 400;
      const code = e.code ?? 'ValidationError';
      const errName =
        code === 'TIER_SOLD_OUT' || code === 'MAX_TICKETS_EXCEEDED' || code === 'EXTRA_SOLD_OUT'
          ? 'SoldOut'
          : code === 'TICKETS_QUANTITY_MISMATCH'
            ? 'BadRequest'
            : 'NotFound';
      return reply.status(status).send({ error: errName, message: e.message });
    }

    const extraCounts = new Map<string, number>();
    for (const ticket of input.tickets) {
      for (const extraId of ticket.extras) {
        extraCounts.set(extraId, (extraCounts.get(extraId) ?? 0) + 1);
      }
    }

    let extraRows: {
      extraId: string;
      quantity: number;
      unitPriceCents: number;
      subtotalCents: number;
    }[] = [];
    if (extraCounts.size > 0) {
      const extras = await prisma.ticketExtra.findMany({
        where: { id: { in: [...extraCounts.keys()] } },
        select: { id: true, priceCents: true },
      });
      const priceMap = new Map(extras.map((e) => [e.id, e.priceCents]));
      extraRows = [...extraCounts.entries()].map(([extraId, qty]) => {
        const unitPriceCents = priceMap.get(extraId) ?? 0;
        return { extraId, quantity: qty, unitPriceCents, subtotalCents: unitPriceCents * qty };
      });
    }

    const amountCents = computeItemAmount(
      { priceCents: validated.tier.priceCents },
      input.quantity,
      extraRows,
    );

    const cart = await getOrCreateCart(sub);

    const updatedCart = await prisma.$transaction(async (tx) => {
      await tx.cartItem.create({
        data: {
          cartId: cart.id,
          eventId: input.eventId,
          tierId: input.tierId,
          source: input.source ?? 'purchase',
          kind: input.kind ?? 'ticket',
          quantity: input.quantity,
          tickets: input.tickets as unknown as object,
          metadata: (input.metadata as unknown as object) ?? undefined,
          amountCents,
          currency: validated.tier.currency,
        },
      });

      if (extraRows.length > 0) {
        const lastItem = await tx.cartItem.findFirst({
          where: { cartId: cart.id },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        });
        if (lastItem) {
          await tx.cartItemExtra.createMany({
            data: extraRows.map((r) => ({
              cartItemId: lastItem.id,
              extraId: r.extraId,
              quantity: r.quantity,
              unitPriceCents: r.unitPriceCents,
              subtotalCents: r.subtotalCents,
            })),
          });
        }
      }

      return tx.cart.update({
        where: { id: cart.id },
        data: { version: { increment: 1 } },
        include: {
          items: {
            include: {
              extras: true,
              tier: { select: { priceCents: true, currency: true } },
            },
          },
        },
      });
    });

    return upsertCartItemResponseSchema.parse({ cart: serializeCart(updatedCart) });
  });

  // PATCH /cart/items/:itemId
  app.patch<{ Params: { itemId: string } }>(
    '/cart/items/:itemId',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { sub } = requireUser(request);
      const { itemId } = request.params;
      const { item: input } = upsertCartItemRequestSchema.parse(request.body);

      const cart = await getActiveCart(sub);
      if (!cart) {
        return reply.status(404).send({ error: 'NotFound', message: 'no active cart' });
      }

      const existing = cart.items.find((i) => i.id === itemId);
      if (!existing) {
        return reply.status(404).send({ error: 'NotFound', message: 'cart item not found' });
      }

      let validated;
      try {
        validated = await validateCartItem(input, sub, itemId);
      } catch (err: unknown) {
        const e = err as Error & { statusCode?: number; code?: string };
        const status = e.statusCode ?? 400;
        const errName =
          e.code === 'TIER_SOLD_OUT' || e.code === 'MAX_TICKETS_EXCEEDED'
            ? 'SoldOut'
            : e.code === 'TICKETS_QUANTITY_MISMATCH'
              ? 'BadRequest'
              : 'NotFound';
        return reply.status(status).send({ error: errName, message: e.message });
      }

      const extraCounts = new Map<string, number>();
      for (const ticket of input.tickets) {
        for (const extraId of ticket.extras) {
          extraCounts.set(extraId, (extraCounts.get(extraId) ?? 0) + 1);
        }
      }

      let extraRows: {
        extraId: string;
        quantity: number;
        unitPriceCents: number;
        subtotalCents: number;
      }[] = [];
      if (extraCounts.size > 0) {
        const extras = await prisma.ticketExtra.findMany({
          where: { id: { in: [...extraCounts.keys()] } },
          select: { id: true, priceCents: true },
        });
        const priceMap = new Map(extras.map((e) => [e.id, e.priceCents]));
        extraRows = [...extraCounts.entries()].map(([extraId, qty]) => {
          const unitPriceCents = priceMap.get(extraId) ?? 0;
          return { extraId, quantity: qty, unitPriceCents, subtotalCents: unitPriceCents * qty };
        });
      }

      const amountCents = computeItemAmount(
        { priceCents: validated.tier.priceCents },
        input.quantity,
        extraRows,
      );

      const updatedCart = await prisma.$transaction(async (tx) => {
        await tx.cartItemExtra.deleteMany({ where: { cartItemId: itemId } });

        await tx.cartItem.update({
          where: { id: itemId },
          data: {
            tierId: input.tierId,
            source: input.source ?? 'purchase',
            kind: input.kind ?? 'ticket',
            quantity: input.quantity,
            tickets: input.tickets as unknown as object,
            metadata: (input.metadata as unknown as object) ?? undefined,
            amountCents,
            currency: validated.tier.currency,
          },
        });

        if (extraRows.length > 0) {
          await tx.cartItemExtra.createMany({
            data: extraRows.map((r) => ({
              cartItemId: itemId,
              extraId: r.extraId,
              quantity: r.quantity,
              unitPriceCents: r.unitPriceCents,
              subtotalCents: r.subtotalCents,
            })),
          });
        }

        return tx.cart.update({
          where: { id: cart.id },
          data: { version: { increment: 1 } },
          include: {
            items: {
              include: {
                extras: true,
                tier: { select: { priceCents: true, currency: true } },
              },
            },
          },
        });
      });

      return upsertCartItemResponseSchema.parse({ cart: serializeCart(updatedCart) });
    },
  );

  // DELETE /cart/items/:itemId
  app.delete<{ Params: { itemId: string } }>(
    '/cart/items/:itemId',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { sub } = requireUser(request);
      const { itemId } = request.params;

      const cart = await getActiveCart(sub);
      if (!cart) {
        return reply.status(404).send({ error: 'NotFound', message: 'no active cart' });
      }

      const item = cart.items.find((i) => i.id === itemId);
      if (!item) {
        return reply.status(404).send({ error: 'NotFound', message: 'cart item not found' });
      }

      await prisma.$transaction(async (tx) => {
        await tx.cartItemExtra.deleteMany({ where: { cartItemId: itemId } });
        await tx.cartItem.delete({ where: { id: itemId } });
        await tx.cart.update({
          where: { id: cart.id },
          data: { version: { increment: 1 } },
        });
      });

      return clearCartResponseSchema.parse({ ok: true });
    },
  );

  // DELETE /cart
  app.delete('/cart', { preHandler: [app.authenticate] }, async (request) => {
    const { sub } = requireUser(request);

    const cart = await getActiveCart(sub);
    if (cart) {
      await prisma.cart.delete({ where: { id: cart.id } });
      console.log('cart.clear', { userId: sub, cartId: cart.id });
    }

    return clearCartResponseSchema.parse({ ok: true });
  });
};
