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
              return {
                id: item.id,
                kind: item.kind,
                title: order.event?.title ?? 'Ingresso',
                detail: item.tier?.name ?? null,
                quantity: item.quantity,
                unitPriceCents: item.unitPriceCents,
                subtotalCents: item.subtotalCents,
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
