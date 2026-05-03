import { prisma } from '@jdm/db';
import { Prisma } from '@prisma/client';

import { signQrCode } from '../../lib/qr.js';

import { signTicketCode } from './codes.js';

type IssueEnv = { readonly TICKET_CODE_SECRET: string };

export type IssueResult = {
  ticketId: string;
  code: string;
  userId: string;
  eventId: string;
  eventTitle: string;
};

export class OrderNotFoundError extends Error {
  readonly code = 'ORDER_NOT_FOUND' as const;
  constructor(public readonly orderId: string) {
    super(`order ${orderId} not found`);
    this.name = 'OrderNotFoundError';
  }
}

export class OrderNotPendingError extends Error {
  readonly code = 'ORDER_NOT_PENDING' as const;
  constructor(
    public readonly orderId: string,
    public readonly status: string,
  ) {
    super(`order is not pending (id=${orderId}, status=${status})`);
    this.name = 'OrderNotPendingError';
  }
}

export class TicketAlreadyExistsForEventError extends Error {
  readonly code = 'TICKET_ALREADY_EXISTS_FOR_EVENT' as const;
  constructor(
    public readonly userId: string,
    public readonly eventId: string,
  ) {
    super(`user ${userId} already has a valid ticket for event ${eventId}`);
    this.name = 'TicketAlreadyExistsForEventError';
  }
}

export class OrderPaidWithoutTicketError extends Error {
  readonly code = 'ORDER_PAID_WITHOUT_TICKET' as const;
  constructor(public readonly orderId: string) {
    super(`order ${orderId} is paid but has no ticket (data integrity error)`);
    this.name = 'OrderPaidWithoutTicketError';
  }
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

// Upsert one TicketExtraItem per OrderExtra for the given ticket.
// Safe to call on redelivery — update: {} is a no-op when the row exists.
// Throws if any OrderExtra has quantity > 1, which requires multi-ticket
// issuance support (not yet built) to issue the correct number of codes.
const upsertExtraItems = async (
  orderId: string,
  ticketId: string,
  env: IssueEnv,
  tx: Tx,
): Promise<void> => {
  const orderExtras = await tx.orderExtra.findMany({
    where: { orderId },
    select: { extraId: true, quantity: true },
  });

  for (const { extraId, quantity } of orderExtras) {
    if (quantity !== 1) {
      // Multi-ticket extra quantities require per-ticket code issuance, which
      // is not yet implemented. Fail loudly rather than issuing too few codes.
      throw new Error(
        `issueTicketForPaidOrder: OrderExtra quantity=${quantity} not supported (orderId=${orderId}, extraId=${extraId})`,
      );
    }
    await tx.ticketExtraItem.upsert({
      where: { ticketId_extraId: { ticketId, extraId } },
      create: {
        ticketId,
        extraId,
        code: signQrCode('e', `${ticketId}-${extraId}`, env),
        status: 'valid',
      },
      update: {},
    });
  }
};

type TicketMeta = { c?: string; p?: string };

// Reads index 0 only — safe because createOrderRequestSchema enforces max(1) ticket per order.
// Update this when JDMA-142 lifts that constraint to support multi-ticket orders.
function extractFirstTicketMeta(metadata: Record<string, string> | undefined): TicketMeta {
  const raw = metadata?.tickets;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed) && parsed.length > 0) {
      return (parsed[0] as TicketMeta) ?? {};
    }
  } catch {
    // malformed metadata — proceed without car fields
  }
  return {};
}

export const issueTicketForPaidOrder = async (
  orderId: string,
  providerRef: string,
  env: IssueEnv,
  intentMetadata?: Record<string, string>,
): Promise<IssueResult> => {
  const ticketMeta = extractFirstTicketMeta(intentMetadata);

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { event: { select: { title: true } } },
    });
    if (!order) throw new OrderNotFoundError(orderId);

    if (order.kind === 'extras_only') {
      return issueExtrasOnly(order, providerRef, env, tx);
    }

    if (order.status === 'paid') {
      const existing = await tx.ticket.findUnique({ where: { orderId } });
      if (!existing) throw new OrderPaidWithoutTicketError(orderId);
      await upsertExtraItems(orderId, existing.id, env, tx);
      return {
        ticketId: existing.id,
        code: signTicketCode(existing.id, env),
        userId: existing.userId,
        eventId: existing.eventId,
        eventTitle: order.event.title,
      };
    }

    if (order.status !== 'pending') {
      throw new OrderNotPendingError(orderId, order.status);
    }

    const conflict = await tx.ticket.findFirst({
      where: { userId: order.userId, eventId: order.eventId, status: 'valid' },
    });
    if (conflict) {
      throw new TicketAlreadyExistsForEventError(order.userId, order.eventId);
    }

    let ticket;
    try {
      ticket = await tx.ticket.create({
        data: {
          orderId: order.id,
          userId: order.userId,
          eventId: order.eventId,
          tierId: order.tierId,
          source: 'purchase',
          status: 'valid',
          ...(ticketMeta.c ? { carId: ticketMeta.c } : {}),
          ...(ticketMeta.p ? { licensePlate: ticketMeta.p } : {}),
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new TicketAlreadyExistsForEventError(order.userId, order.eventId);
      }
      throw err;
    }

    await tx.order.update({
      where: { id: order.id },
      data: { status: 'paid', paidAt: new Date(), providerRef },
    });

    await upsertExtraItems(orderId, ticket.id, env, tx);

    return {
      ticketId: ticket.id,
      code: signTicketCode(ticket.id, env),
      userId: order.userId,
      eventId: order.eventId,
      eventTitle: order.event.title,
    };
  });
};

const issueExtrasOnly = async (
  order: { id: string; userId: string; eventId: string; status: string; event: { title: string } },
  providerRef: string,
  env: IssueEnv,
  tx: Tx,
): Promise<IssueResult> => {
  const ticket = await tx.ticket.findFirst({
    where: { userId: order.userId, eventId: order.eventId, status: 'valid' },
  });
  if (!ticket) {
    throw new Error(
      `extras_only order ${order.id} but no valid ticket for user ${order.userId} event ${order.eventId}`,
    );
  }

  if (order.status === 'paid') {
    await upsertExtraItems(order.id, ticket.id, env, tx);
    return {
      ticketId: ticket.id,
      code: signTicketCode(ticket.id, env),
      userId: order.userId,
      eventId: order.eventId,
      eventTitle: order.event.title,
    };
  }

  if (order.status !== 'pending') {
    throw new OrderNotPendingError(order.id, order.status);
  }

  await tx.order.update({
    where: { id: order.id },
    data: { status: 'paid', paidAt: new Date(), providerRef },
  });

  await upsertExtraItems(order.id, ticket.id, env, tx);

  return {
    ticketId: ticket.id,
    code: signTicketCode(ticket.id, env),
    userId: order.userId,
    eventId: order.eventId,
    eventTitle: order.event.title,
  };
};
