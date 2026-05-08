import { prisma } from '@jdm/db';
import type { StorePickupItem, StorePickupOrder } from '@jdm/shared/check-in';

import { recordAudit } from '../admin-audit.js';

const parsePickupTicketId = (notes: string | null): string | null => {
  if (!notes) return null;
  try {
    const parsed = JSON.parse(notes) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const id = (parsed as Record<string, unknown>).pickupTicketId;
      return typeof id === 'string' ? id : null;
    }
  } catch {
    // ignore malformed notes
  }
  return null;
};

const mapItems = (
  items: {
    id: string;
    quantity: number;
    variant: {
      name: string | null;
      sku: string | null;
      attributes: unknown;
      product: { title: string };
    } | null;
  }[],
): StorePickupItem[] =>
  items.map((it) => {
    const attrs =
      it.variant?.attributes && typeof it.variant.attributes === 'object'
        ? Object.fromEntries(
            Object.entries(it.variant.attributes as Record<string, unknown>).filter(
              (e): e is [string, string] => typeof e[1] === 'string',
            ),
          )
        : null;
    return {
      id: it.id,
      productTitle: it.variant?.product.title ?? null,
      variantName: it.variant?.name ?? null,
      variantSku: it.variant?.sku ?? null,
      variantAttributes: attrs,
      quantity: it.quantity,
    };
  });

const queryPickupOrders = async (ticketId: string) => {
  const candidates = await prisma.order.findMany({
    where: {
      fulfillmentMethod: 'pickup',
      status: 'paid',
      notes: { contains: ticketId },
    },
    include: {
      items: {
        where: { kind: 'product' },
        include: {
          variant: {
            select: {
              name: true,
              sku: true,
              attributes: true,
              product: { select: { title: true } },
            },
          },
        },
      },
    },
  });
  return candidates.filter((o) => parsePickupTicketId(o.notes) === ticketId);
};

export const getPickupOrdersForTicket = async (ticketId: string): Promise<StorePickupOrder[]> => {
  const orders = await queryPickupOrders(ticketId);
  return orders.map((o) => ({
    orderId: o.id,
    shortId: o.id.slice(-8).toUpperCase(),
    fulfillmentStatus: o.fulfillmentStatus as StorePickupOrder['fulfillmentStatus'],
    items: mapItems(o.items),
  }));
};

export type PickupCollectResult = {
  orderId: string;
  shortId: string;
  collected: boolean;
  fulfillmentStatus: StorePickupOrder['fulfillmentStatus'];
  items: StorePickupItem[];
};

export const collectPickupOrders = async (
  ticketId: string,
  actorId: string,
): Promise<PickupCollectResult[]> => {
  const orders = await queryPickupOrders(ticketId);
  const results: PickupCollectResult[] = [];

  for (const order of orders) {
    const alreadyCollected = order.fulfillmentStatus === 'picked_up';
    const cancelled = order.fulfillmentStatus === 'cancelled';

    if (!alreadyCollected && !cancelled) {
      await prisma.$transaction(async (tx) => {
        await tx.order.update({
          where: { id: order.id },
          data: { fulfillmentStatus: 'picked_up' },
        });
        await recordAudit(
          {
            actorId,
            action: 'store.order.fulfillment_update',
            entityType: 'order',
            entityId: order.id,
            metadata: {
              from: order.fulfillmentStatus,
              to: 'picked_up',
              method: 'pickup',
              source: 'check_in_scan',
            },
          },
          tx,
        );
      });
    }

    results.push({
      orderId: order.id,
      shortId: order.id.slice(-8).toUpperCase(),
      collected: !alreadyCollected && !cancelled,
      fulfillmentStatus: cancelled ? 'cancelled' : 'picked_up',
      items: mapItems(order.items),
    });
  }

  return results;
};
