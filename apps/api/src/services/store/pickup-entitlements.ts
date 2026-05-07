import { prisma } from '@jdm/db';
import type { Prisma } from '@prisma/client';

import {
  InvalidTicketCodeError,
  TicketNotFoundError,
  TicketRevokedError,
  TicketWrongEventError,
} from '../tickets/check-in.js';
import { verifyTicketCode } from '../tickets/codes.js';

type PickupNote = {
  eventId: string;
  ticketId: string | null;
  pickedUpAt: string | null;
  pickedUpBy: string | null;
};

type ProductOrderWithItems = Prisma.OrderGetPayload<{
  include: {
    items: {
      where: { kind: 'product' };
      include: { variant: { include: { product: true } } };
    };
  };
}>;

type TicketWithRelations = Prisma.TicketGetPayload<{
  include: { tier: true; user: true; car: true };
}>;

const ticketInclude = { tier: true, user: true, car: true } as const;

const parsePickupNote = (notes: string | null): PickupNote | null => {
  if (!notes) return null;

  try {
    const parsed = JSON.parse(notes) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return null;
    const pickup = (parsed as { pickup?: Record<string, unknown> }).pickup;
    if (!pickup || typeof pickup !== 'object') return null;

    const eventId = typeof pickup.eventId === 'string' ? pickup.eventId : null;
    if (!eventId) return null;

    return {
      eventId,
      ticketId: typeof pickup.ticketId === 'string' ? pickup.ticketId : null,
      pickedUpAt: typeof pickup.pickedUpAt === 'string' ? pickup.pickedUpAt : null,
      pickedUpBy: typeof pickup.pickedUpBy === 'string' ? pickup.pickedUpBy : null,
    };
  } catch {
    return null;
  }
};

const serializePickupNote = (pickup: PickupNote): string =>
  JSON.stringify({
    pickup: {
      eventId: pickup.eventId,
      ticketId: pickup.ticketId,
      pickedUpAt: pickup.pickedUpAt,
      pickedUpBy: pickup.pickedUpBy,
    },
  });

const findAssignedTicketId = async (
  tx: Prisma.TransactionClient,
  userId: string,
  pickup: PickupNote,
): Promise<string | null> => {
  if (pickup.ticketId) {
    const ticket = await tx.ticket.findFirst({
      where: {
        id: pickup.ticketId,
        userId,
        eventId: pickup.eventId,
        status: { in: ['valid', 'used'] },
      },
      select: { id: true },
    });
    return ticket?.id ?? null;
  }

  const tickets = await tx.ticket.findMany({
    where: {
      userId,
      eventId: pickup.eventId,
      status: { in: ['valid', 'used'] },
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });

  if (tickets.length === 1) return tickets[0]!.id;
  return null;
};

export const settleProductOrderForPaidWebhook = async (
  orderId: string,
  providerRef: string,
): Promise<void> => {
  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        userId: true,
        cartId: true,
        status: true,
        kind: true,
        providerRef: true,
        fulfillmentMethod: true,
        fulfillmentStatus: true,
        notes: true,
      },
    });

    if (!order) {
      throw new Error(`order ${orderId} not found`);
    }
    if (order.kind !== 'product') {
      throw new Error(`settleProductOrderForPaidWebhook called on ${order.kind} order ${orderId}`);
    }
    if (order.status === 'paid') return;
    if (order.status !== 'pending') {
      throw new Error(`order ${orderId} is not pending (status=${order.status})`);
    }

    const pickup = parsePickupNote(order.notes);
    let nextNotes = order.notes;
    let nextFulfillmentStatus = order.fulfillmentStatus;

    if (order.fulfillmentMethod === 'pickup' && pickup) {
      const ticketId = await findAssignedTicketId(tx, order.userId, pickup);
      if (ticketId) {
        nextNotes = serializePickupNote({ ...pickup, ticketId });
        nextFulfillmentStatus = 'pickup_ready';
      }
    }

    await tx.order.update({
      where: { id: orderId },
      data: {
        status: 'paid',
        paidAt: new Date(),
        fulfillmentStatus: nextFulfillmentStatus,
        notes: nextNotes,
        ...(order.cartId ? {} : { providerRef }),
      },
    });
  });
};

type PickupOrderSummary = {
  orderId: string;
  fulfillmentStatus: 'pickup_ready' | 'picked_up';
  pickedUpAt: Date | null;
  items: Array<{
    orderItemId: string;
    quantity: number;
    productTitle: string;
    variantName: string;
    variantSku: string | null;
    attributes: Record<string, unknown> | null;
  }>;
};

export type ClaimTicketPickupOutcome =
  | {
      kind: 'claimed';
      ticket: TicketWithRelations;
      pickups: PickupOrderSummary[];
      pickedUpAt: Date;
    }
  | {
      kind: 'already_used';
      ticket: TicketWithRelations;
      pickups: PickupOrderSummary[];
      pickedUpAt: Date;
    };

export class PickupEntitlementNotFoundError extends Error {
  readonly code = 'PICKUP_ENTITLEMENT_NOT_FOUND';
  constructor(message = 'pickup entitlement not found') {
    super(message);
  }
}

const mapPickupOrder = (order: ProductOrderWithItems): PickupOrderSummary => {
  const pickup = parsePickupNote(order.notes);
  const pickedUpAt = pickup?.pickedUpAt ? new Date(pickup.pickedUpAt) : null;

  return {
    orderId: order.id,
    fulfillmentStatus: order.fulfillmentStatus === 'picked_up' ? 'picked_up' : 'pickup_ready',
    pickedUpAt,
    items: order.items.map((item) => ({
      orderItemId: item.id,
      quantity: item.quantity,
      productTitle: item.variant?.product.title ?? 'Produto',
      variantName: item.variant?.name ?? 'Variação',
      variantSku: item.variant?.sku ?? null,
      attributes: (item.variant?.attributes as Record<string, unknown> | null) ?? null,
    })),
  };
};

export const claimTicketPickup = async (
  input: { code: string; eventId: string; actorId: string },
  env: { readonly TICKET_CODE_SECRET: string },
): Promise<ClaimTicketPickupOutcome> => {
  let ticketId: string;
  try {
    ticketId = verifyTicketCode(input.code, env);
  } catch {
    throw new InvalidTicketCodeError();
  }

  return prisma.$transaction(async (tx) => {
    const ticket = await tx.ticket.findUnique({
      where: { id: ticketId },
      include: ticketInclude,
    });
    if (!ticket) throw new TicketNotFoundError();
    if (ticket.eventId !== input.eventId) {
      throw new TicketWrongEventError(input.eventId, ticket.eventId);
    }
    if (ticket.status === 'revoked') throw new TicketRevokedError();

    const candidateOrders = await tx.order.findMany({
      where: {
        userId: ticket.userId,
        kind: 'product',
        status: 'paid',
        fulfillmentMethod: 'pickup',
        fulfillmentStatus: { in: ['pickup_ready', 'picked_up'] },
      },
      include: {
        items: {
          where: { kind: 'product' },
          include: { variant: { include: { product: true } } },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const matching = candidateOrders.filter((order) => {
      const pickup = parsePickupNote(order.notes);
      return pickup?.eventId === input.eventId && pickup.ticketId === ticket.id;
    });

    if (matching.length === 0) {
      throw new PickupEntitlementNotFoundError();
    }

    const now = new Date();
    const claimedOrderIds = new Set<string>();

    for (const order of matching) {
      if (order.fulfillmentStatus !== 'pickup_ready') continue;

      const pickup = parsePickupNote(order.notes);
      if (!pickup) continue;

      const updated = await tx.order.updateMany({
        where: { id: order.id, fulfillmentStatus: 'pickup_ready', status: 'paid' },
        data: {
          fulfillmentStatus: 'picked_up',
          notes: serializePickupNote({
            ...pickup,
            ticketId: ticket.id,
            pickedUpAt: now.toISOString(),
            pickedUpBy: input.actorId,
          }),
        },
      });

      if (updated.count === 1) {
        claimedOrderIds.add(order.id);
      }
    }

    const refreshed = await tx.order.findMany({
      where: { id: { in: matching.map((order) => order.id) } },
      include: {
        items: {
          where: { kind: 'product' },
          include: { variant: { include: { product: true } } },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const pickups = refreshed.map(mapPickupOrder);
    const firstPickedUpAt = pickups.find((pickup) => pickup.pickedUpAt !== null)?.pickedUpAt ?? now;

    if (claimedOrderIds.size > 0) {
      return {
        kind: 'claimed',
        ticket,
        pickups,
        pickedUpAt: firstPickedUpAt,
      };
    }

    return {
      kind: 'already_used',
      ticket,
      pickups,
      pickedUpAt: firstPickedUpAt,
    };
  });
};
