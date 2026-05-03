import { prisma } from '@jdm/db';
import {
  createOrderRequestSchema,
  createOrderResponseSchema,
  createWebCheckoutRequestSchema,
  createWebCheckoutResponseSchema,
  getOrderResponseSchema,
  type TicketInput,
} from '@jdm/shared/orders';
import type { FastifyPluginAsync } from 'fastify';

import { requireUser } from '../plugins/auth.js';
import {
  expireSingleOrder,
  ORDER_EXPIRY_MS,
  sweepExpiredOrdersForTier,
} from '../services/orders/expire.js';
import { reserveExtras, validateTickets } from '../services/orders/validate-tickets.js';

type PreparedOrder = {
  sub: string;
  event: { id: string; title: string };
  tier: { id: string; priceCents: number; currency: string; quantityTotal: number };
  isExtrasOnly: boolean;
  validationResult: Awaited<ReturnType<typeof validateTickets>>;
  expiredProviderRefs: string[];
  reserved: boolean;
  amountCents: number;
  ticketCount: number;
};

async function prepareOrder(
  sub: string,
  input: { eventId: string; tierId: string; method: string; tickets: TicketInput[] },
): Promise<
  | { ok: true; data: PreparedOrder }
  | { ok: false; status: number; body: { error: string; message: string } }
> {
  if (input.method !== 'card') {
    return {
      ok: false,
      status: 400,
      body: { error: 'BadRequest', message: 'only card is supported in this release' },
    };
  }

  const event = await prisma.event.findFirst({
    where: { id: input.eventId, status: 'published' },
  });
  if (!event)
    return { ok: false, status: 404, body: { error: 'NotFound', message: 'event not found' } };

  const tier = await prisma.ticketTier.findFirst({
    where: { id: input.tierId, eventId: event.id },
  });
  if (!tier)
    return { ok: false, status: 404, body: { error: 'NotFound', message: 'tier not found' } };

  const existingTicket = await prisma.ticket.findFirst({
    where: { userId: sub, eventId: event.id, status: 'valid' },
  });

  const isExtrasOnly = !!existingTicket;

  if (isExtrasOnly) {
    const allExtras = input.tickets.flatMap((t) => t.extras ?? []);
    if (allExtras.length === 0) {
      return {
        ok: false,
        status: 422,
        body: {
          error: 'UnprocessableEntity',
          message: 'extras required when ticket already exists',
        },
      };
    }
  }

  let validationResult: Awaited<ReturnType<typeof validateTickets>>;
  let expiredProviderRefs: string[];
  let reserved = false;

  try {
    const txResult = await prisma.$transaction(async (tx) => {
      if (isExtrasOnly) {
        const allExtras = input.tickets.flatMap((t) => t.extras ?? []);
        const existingItems = await tx.ticketExtraItem.findMany({
          where: { ticketId: existingTicket.id, extraId: { in: allExtras } },
          select: { extraId: true },
        });
        if (existingItems.length > 0) {
          const err = new Error(
            `extra already purchased for this ticket: ${existingItems[0]!.extraId}`,
          );
          (err as Error & { code: string }).code = 'DUPLICATE_EXTRA_ON_TICKET';
          throw err;
        }
      }

      const validation = await validateTickets(input.tickets, tier, event.id, tx, sub, {
        skipCarValidation: isExtrasOnly,
      });
      const sweep = await sweepExpiredOrdersForTier(tier.id, tx);

      if (!isExtrasOnly) {
        const reservation = await tx.ticketTier.updateMany({
          where: { id: tier.id, quantitySold: { lt: tier.quantityTotal } },
          data: { quantitySold: { increment: 1 } },
        });
        if (reservation.count === 0) {
          return { soldOut: true, validation, expiredProviderRefs: sweep.expiredProviderRefs };
        }
      }

      await reserveExtras(validation.extraStock, tx);
      return { soldOut: false, validation, expiredProviderRefs: sweep.expiredProviderRefs };
    });

    if (txResult.soldOut) {
      return { ok: false, status: 409, body: { error: 'Conflict', message: 'sold out' } };
    }

    validationResult = txResult.validation;
    expiredProviderRefs = txResult.expiredProviderRefs;
    reserved = !isExtrasOnly;
  } catch (err) {
    const coded = err as Error & { code?: string };
    if (
      coded.code === 'MISSING_CAR_ID' ||
      coded.code === 'MISSING_PLATE' ||
      coded.code === 'CAR_NOT_OWNED' ||
      coded.code === 'DUPLICATE_EXTRA'
    ) {
      return {
        ok: false,
        status: 422,
        body: { error: 'UnprocessableEntity', message: coded.message ?? '' },
      };
    }
    if (coded.code === 'EXTRA_NOT_FOUND') {
      return { ok: false, status: 404, body: { error: 'NotFound', message: coded.message ?? '' } };
    }
    if (coded.code === 'EXTRA_SOLD_OUT' || coded.code === 'DUPLICATE_EXTRA_ON_TICKET') {
      return { ok: false, status: 409, body: { error: 'Conflict', message: coded.message ?? '' } };
    }
    throw err;
  }

  const amountCents = isExtrasOnly
    ? validationResult.totalExtrasCents
    : tier.priceCents * input.tickets.length + validationResult.totalExtrasCents;

  return {
    ok: true,
    data: {
      sub,
      event: { id: event.id, title: event.title },
      tier: {
        id: tier.id,
        priceCents: tier.priceCents,
        currency: tier.currency,
        quantityTotal: tier.quantityTotal,
      },
      isExtrasOnly,
      validationResult,
      expiredProviderRefs,
      reserved,
      amountCents,
      ticketCount: input.tickets.length,
    },
  };
}

async function createPendingOrder(
  data: PreparedOrder,
): Promise<{ order: { id: string }; extraEntries: Array<{ extraId: string; quantity: number }> }> {
  const expiresAt = new Date(Date.now() + ORDER_EXPIRY_MS);
  const order = await prisma.order.create({
    data: {
      userId: data.sub,
      eventId: data.event.id,
      tierId: data.tier.id,
      kind: data.isExtrasOnly ? 'extras_only' : 'ticket',
      amountCents: data.amountCents,
      currency: data.tier.currency,
      method: 'card',
      provider: 'stripe',
      status: 'pending',
      expiresAt,
    },
  });

  if (data.validationResult.extraEntries.length > 0) {
    await prisma.orderExtra.createMany({
      data: data.validationResult.extraEntries.map(({ extraId, quantity }) => ({
        orderId: order.id,
        extraId,
        quantity,
      })),
      skipDuplicates: true,
    });
  }

  return { order, extraEntries: data.validationResult.extraEntries };
}

async function rollbackReservation(data: PreparedOrder, tierId: string): Promise<void> {
  if (data.reserved) {
    await prisma.ticketTier.updateMany({
      where: { id: tierId, quantitySold: { gt: 0 } },
      data: { quantitySold: { decrement: 1 } },
    });
  }
  for (const { id, count } of data.validationResult.extraStock) {
    await prisma.ticketExtra.updateMany({
      where: { id, quantitySold: { gte: count } },
      data: { quantitySold: { decrement: count } },
    });
  }
}

// eslint-disable-next-line @typescript-eslint/require-await
export const orderRoutes: FastifyPluginAsync = async (app) => {
  app.post('/orders', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { sub } = requireUser(request);
    const input = createOrderRequestSchema.parse(request.body);

    const result = await prepareOrder(sub, input);
    if (!result.ok) return reply.status(result.status).send(result.body);
    const data = result.data;

    for (const ref of data.expiredProviderRefs) {
      app.stripe.cancelPaymentIntent(ref).catch((cancelErr) => {
        request.log.warn(
          { err: cancelErr, providerRef: ref },
          'orders: stripe PI cancel failed after sweep',
        );
      });
    }

    try {
      const { order } = await createPendingOrder(data);

      const intent = await app.stripe.createPaymentIntent({
        amountCents: data.amountCents,
        currency: data.tier.currency,
        idempotencyKey: order.id,
        metadata: {
          orderId: order.id,
          userId: sub,
          eventId: data.event.id,
          tierId: data.tier.id,
          tickets: JSON.stringify(data.validationResult.ticketsMetadata),
        },
      });

      await prisma.order.update({
        where: { id: order.id },
        data: { providerRef: intent.id },
      });

      return reply.status(201).send(
        createOrderResponseSchema.parse({
          orderId: order.id,
          status: 'pending',
          clientSecret: intent.clientSecret,
          amountCents: data.amountCents,
          currency: data.tier.currency,
        }),
      );
    } catch (err) {
      await rollbackReservation(data, data.tier.id);
      throw err;
    }
  });

  app.post('/orders/checkout', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { sub } = requireUser(request);
    const parsed = createWebCheckoutRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'UnprocessableEntity',
        message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      });
    }
    const input = parsed.data;

    const result = await prepareOrder(sub, input);
    if (!result.ok) return reply.status(result.status).send(result.body);
    const data = result.data;

    for (const ref of data.expiredProviderRefs) {
      app.stripe.cancelPaymentIntent(ref).catch((cancelErr) => {
        request.log.warn(
          { err: cancelErr, providerRef: ref },
          'orders: stripe PI cancel failed after sweep',
        );
      });
    }

    try {
      const { order } = await createPendingOrder(data);

      const expiresAtUnix = Math.floor((Date.now() + ORDER_EXPIRY_MS) / 1000);
      const session = await app.stripe.createCheckoutSession({
        amountCents: data.amountCents,
        currency: data.tier.currency,
        productName: data.event.title,
        idempotencyKey: `checkout_${order.id}`,
        metadata: {
          orderId: order.id,
          userId: sub,
          eventId: data.event.id,
          tierId: data.tier.id,
          tickets: JSON.stringify(data.validationResult.ticketsMetadata),
        },
        successUrl: input.successUrl,
        cancelUrl: input.cancelUrl,
        expiresAt: expiresAtUnix,
      });

      await prisma.order.update({
        where: { id: order.id },
        data: { providerRef: session.paymentIntentId },
      });

      return reply.status(201).send(
        createWebCheckoutResponseSchema.parse({
          orderId: order.id,
          status: 'pending',
          checkoutUrl: session.url,
          amountCents: data.amountCents,
          currency: data.tier.currency,
        }),
      );
    } catch (err) {
      await rollbackReservation(data, data.tier.id);
      throw err;
    }
  });

  app.get('/orders/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { sub } = requireUser(request);
    const { id } = request.params as { id: string };

    const result = await expireSingleOrder(id, sub);
    if (!result) return reply.status(404).send({ error: 'NotFound', message: 'order not found' });

    const { order, wasExpired } = result;

    if (wasExpired && order.providerRef) {
      app.stripe.cancelPaymentIntent(order.providerRef).catch((cancelErr) => {
        request.log.warn(
          { err: cancelErr, orderId: id },
          'orders: stripe PI cancel failed after lazy expiry',
        );
      });
    }

    return reply.status(200).send(
      getOrderResponseSchema.parse({
        orderId: order.id,
        status: order.status,
        expiresAt: order.expiresAt?.toISOString() ?? null,
        amountCents: order.amountCents,
        currency: order.currency,
      }),
    );
  });
};
