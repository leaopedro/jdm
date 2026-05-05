import rateLimit from '@fastify/rate-limit';
import { prisma } from '@jdm/db';
import {
  createOrderRequestSchema,
  createOrderResponseSchema,
  createPixOrderResponseSchema,
  createWebCheckoutRequestSchema,
  createWebCheckoutResponseSchema,
  getOrderResponseSchema,
  type TicketInput,
} from '@jdm/shared/orders';
import type { FastifyPluginAsync } from 'fastify';

import { requireUser } from '../plugins/auth.js';
import { AbacatePayUpstreamError } from '../services/abacatepay/index.js';
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
  input: {
    eventId: string;
    tierId: string;
    method: string;
    tickets: TicketInput[];
    extrasOnly?: boolean;
  },
): Promise<
  | { ok: true; data: PreparedOrder }
  | { ok: false; status: number; body: { error: string; message: string } }
> {
  if (input.method !== 'card' && input.method !== 'pix') {
    return {
      ok: false,
      status: 400,
      body: { error: 'BadRequest', message: 'unsupported payment method' },
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

  const isExtrasOnly = !!input.extrasOnly;

  let existingTicket: { id: string } | null = null;
  if (isExtrasOnly) {
    existingTicket = await prisma.ticket.findFirst({
      where: { userId: sub, eventId: event.id, status: 'valid' },
      select: { id: true },
    });
    if (!existingTicket) {
      return {
        ok: false,
        status: 422,
        body: {
          error: 'UnprocessableEntity',
          message: 'extras-only requires an existing valid ticket',
        },
      };
    }
    const allExtras = input.tickets.flatMap((t) => t.extras ?? []);
    if (allExtras.length === 0) {
      return {
        ok: false,
        status: 422,
        body: {
          error: 'UnprocessableEntity',
          message: 'extras required for extras-only order',
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
          where: { ticketId: existingTicket!.id, extraId: { in: allExtras } },
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
      quantity: data.ticketCount,
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

async function createPendingOrderPix(
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
      quantity: data.ticketCount,
      currency: data.tier.currency,
      method: 'pix',
      provider: 'abacatepay',
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

const withReturnParams = (rawUrl: string, params: Record<string, string>): string => {
  const url = new URL(rawUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
};

export const orderRoutes: FastifyPluginAsync = async (app) => {
  app.post('/orders', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { sub } = requireUser(request);
    const input = createOrderRequestSchema.parse(request.body);

    const result = await prepareOrder(sub, input);
    if (!result.ok) return reply.status(result.status).send(result.body);
    const data = result.data;

    if (input.method === 'pix') {
      if (!app.abacatepay) {
        await rollbackReservation(data, data.tier.id);
        return reply
          .status(503)
          .send({ error: 'ServiceUnavailable', message: 'pix provider not configured' });
      }

      try {
        const { order } = await createPendingOrderPix(data);

        let billing;
        try {
          billing = await app.abacatepay.createPixBilling({
            amountCents: data.amountCents,
            description: `Ingresso ${data.event.title}`,
            metadata: {
              orderId: order.id,
              userId: sub,
              eventId: data.event.id,
              tierId: data.tier.id,
              tickets: JSON.stringify(data.validationResult.ticketsMetadata),
            },
          });
        } catch (providerErr) {
          if (
            providerErr instanceof AbacatePayUpstreamError &&
            providerErr.status >= 400 &&
            providerErr.status < 500
          ) {
            request.log.warn(
              { err: providerErr, orderId: order.id, status: providerErr.status },
              'orders: AbacatePay rejected pix billing request',
            );
            await prisma.order.update({
              where: { id: order.id },
              data: { status: 'expired' },
            });
            await rollbackReservation(data, data.tier.id);
            return reply.status(502).send({
              error: 'BadGateway',
              message: 'pix provider rejected the request',
            });
          }
          throw providerErr;
        }

        await prisma.order.update({
          where: { id: order.id },
          data: { providerRef: billing.id },
        });

        return reply.status(201).send(
          createPixOrderResponseSchema.parse({
            orderId: order.id,
            status: 'pending',
            brCode: billing.brCode,
            expiresAt: billing.expiresAt,
            amountCents: data.amountCents,
            currency: data.tier.currency,
          }),
        );
      } catch (err) {
        await rollbackReservation(data, data.tier.id);
        throw err;
      }
    }

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
      const successUrl = withReturnParams(input.successUrl, { orderId: order.id });
      const cancelUrl = withReturnParams(input.cancelUrl, {
        orderId: order.id,
        cancelled: 'true',
      });

      // Stripe requires expires_at >= 30 min from now; order expiry is 15 min.
      // Use the Stripe minimum so the session is accepted; the order-level sweep
      // handles early cancellation independently.
      const STRIPE_MIN_SESSION_MS = 30 * 60 * 1000;
      const sessionExpiryMs = Math.max(ORDER_EXPIRY_MS, STRIPE_MIN_SESSION_MS);
      const expiresAtUnix = Math.floor((Date.now() + sessionExpiryMs) / 1000);
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
        successUrl,
        cancelUrl,
        expiresAt: expiresAtUnix,
      });

      if (session.paymentIntentId) {
        await prisma.order.update({
          where: { id: order.id },
          data: { providerRef: session.paymentIntentId },
        });
      }

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

  await app.register(async (scoped) => {
    await scoped.register(rateLimit, {
      max: 60,
      timeWindow: '1 minute',
      keyGenerator: (req) => {
        const auth = (req as unknown as { user?: { sub?: string } }).user;
        return auth?.sub ? `order-poll:${auth.sub}` : `order-poll-ip:${req.ip}`;
      },
    });

    scoped.get('/orders/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
      const { sub } = requireUser(request);
      const { id } = request.params as { id: string };

      const result = await expireSingleOrder(id, sub);
      if (result.kind === 'not_found') {
        return reply.status(404).send({ error: 'NotFound', message: 'order not found' });
      }
      if (result.kind === 'forbidden') {
        return reply.status(403).send({ error: 'Forbidden', message: 'not your order' });
      }

      const { order, wasExpired } = result;

      if (wasExpired && order.providerRef && order.provider === 'stripe') {
        app.stripe.cancelPaymentIntent(order.providerRef).catch((cancelErr) => {
          request.log.warn(
            { err: cancelErr, orderId: id },
            'orders: stripe PI cancel failed after lazy expiry',
          );
        });
      }

      let ticketId: string | undefined;
      if (order.status === 'paid') {
        const ticket = await prisma.ticket.findFirst({
          where: { orderId: order.id },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: { id: true },
        });
        ticketId = ticket?.id;
      }

      reply.header('Cache-Control', 'no-store');

      return reply.status(200).send(
        getOrderResponseSchema.parse({
          orderId: order.id,
          status: order.status,
          provider: order.provider,
          expiresAt: order.expiresAt?.toISOString() ?? null,
          amountCents: order.amountCents,
          currency: order.currency,
          ...(ticketId ? { ticketId } : {}),
        }),
      );
    });
  });
};
