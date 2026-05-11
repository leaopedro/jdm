import { prisma } from '@jdm/db';
import { myOrdersResponseSchema } from '@jdm/shared/orders';
import type { FastifyPluginAsync } from 'fastify';

import { requireUser } from '../plugins/auth.js';

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
};
