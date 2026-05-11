import { prisma } from '@jdm/db';
import { cancelMyOrderResponseSchema, myOrdersResponseSchema } from '@jdm/shared/orders';
import type { FastifyPluginAsync } from 'fastify';

import { requireUser } from '../plugins/auth.js';
import { cancelPendingOrder } from '../services/orders/cancel.js';

// eslint-disable-next-line @typescript-eslint/require-await
export const meOrdersRoutes: FastifyPluginAsync = async (app) => {
  app.get('/me/orders', { preHandler: [app.authenticate] }, async (request) => {
    const { sub } = requireUser(request);

    const orders = await prisma.order.findMany({
      where: { userId: sub },
      include: {
        event: true,
        items: {
          include: {
            tier: true,
            extra: true,
            variant: { include: { product: true } },
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    const paidOrderIds = orders.filter((o) => o.status === 'paid').map((o) => o.id);
    const tickets = paidOrderIds.length
      ? await prisma.ticket.findMany({
          where: { orderId: { in: paidOrderIds }, userId: sub },
          select: { id: true, orderId: true, tierId: true, eventId: true, createdAt: true },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        })
      : [];
    const ticketsByKey = new Map<string, string[]>();
    for (const t of tickets) {
      if (!t.orderId) continue;
      const key = `${t.orderId}|${t.eventId}|${t.tierId}`;
      const list = ticketsByKey.get(key) ?? [];
      list.push(t.id);
      ticketsByKey.set(key, list);
    }

    return myOrdersResponseSchema.parse({
      items: orders.map((order) => {
        const containsTickets = order.items.some((item) => item.kind === 'ticket');
        const containsStoreItems = order.items.some((item) => item.kind === 'product');

        return {
          id: order.id,
          shortId: order.id.slice(-8).toUpperCase(),
          kind: order.kind,
          status: order.status,
          provider: order.provider,
          amountCents: order.amountCents,
          currency: order.currency,
          quantity: order.quantity,
          shippingCents: order.shippingCents,
          createdAt: order.createdAt.toISOString(),
          paidAt: order.paidAt?.toISOString() ?? null,
          expiresAt: order.expiresAt?.toISOString() ?? null,
          containsTickets,
          containsStoreItems,
          fulfillmentMethod: containsStoreItems ? order.fulfillmentMethod : null,
          fulfillmentStatus: containsStoreItems ? order.fulfillmentStatus : null,
          event: order.event
            ? {
                id: order.event.id,
                slug: order.event.slug,
                title: order.event.title,
                coverUrl: order.event.coverObjectKey
                  ? app.uploads.buildPublicUrl(order.event.coverObjectKey)
                  : null,
                startsAt: order.event.startsAt.toISOString(),
                endsAt: order.event.endsAt.toISOString(),
                venueName: order.event.venueName,
                city: order.event.city,
                stateCode: order.event.stateCode,
                type: order.event.type,
                status: order.event.status,
              }
            : null,
          items: order.items.map((item) => {
            if (item.kind === 'product') {
              return {
                id: item.id,
                kind: item.kind,
                title: item.variant?.product.title ?? 'Produto',
                detail: item.variant?.name ?? null,
                quantity: item.quantity,
                unitPriceCents: item.unitPriceCents,
                subtotalCents: item.subtotalCents,
              };
            }

            if (item.kind === 'ticket') {
              const eventId = item.eventId ?? order.eventId;
              const tierId = item.tierId ?? order.tierId;
              const key = eventId && tierId ? `${order.id}|${eventId}|${tierId}` : null;
              const queue = key ? ticketsByKey.get(key) : undefined;
              const ticketIds = queue ? queue.splice(0, item.quantity) : [];
              return {
                id: item.id,
                kind: item.kind,
                title: order.event?.title ?? 'Ingresso',
                detail: item.tier?.name ?? null,
                quantity: item.quantity,
                unitPriceCents: item.unitPriceCents,
                subtotalCents: item.subtotalCents,
                ...(ticketIds.length > 0 ? { ticketIds } : {}),
              };
            }

            return {
              id: item.id,
              kind: item.kind,
              title: item.extra?.name ?? 'Extra',
              detail: order.event?.title ?? null,
              quantity: item.quantity,
              unitPriceCents: item.unitPriceCents,
              subtotalCents: item.subtotalCents,
            };
          }),
        };
      }),
    });
  });

  app.post('/me/orders/:id/cancel', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { sub } = requireUser(request);
    const { id } = request.params as { id: string };

    const result = await cancelPendingOrder(id, sub);
    if (result.kind === 'not_found') {
      return reply.status(404).send({ error: 'NotFound', message: 'order not found' });
    }
    if (result.kind === 'forbidden') {
      return reply.status(403).send({ error: 'Forbidden', message: 'not your order' });
    }
    if (result.kind === 'not_pending') {
      return reply.status(409).send({
        error: 'Conflict',
        message: `order cannot be cancelled from status ${result.status}`,
      });
    }

    // Stripe exposes explicit PaymentIntent cancellation. The current
    // AbacatePay transparent flow only exposes status polling/webhooks, so
    // local cancellation is the best available upstream-safe behavior there.
    if (result.order.provider === 'stripe' && result.order.providerRef) {
      app.stripe.cancelPaymentIntent(result.order.providerRef).catch((cancelErr) => {
        request.log.warn(
          { err: cancelErr, orderId: result.order.id, providerRef: result.order.providerRef },
          'me orders: stripe PI cancel failed after local cancellation',
        );
      });
    }

    return reply.status(200).send(
      cancelMyOrderResponseSchema.parse({
        orderId: result.order.id,
        status: result.order.status,
      }),
    );
  });
};
