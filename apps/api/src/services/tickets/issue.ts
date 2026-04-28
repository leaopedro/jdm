import { prisma } from '@jdm/db';
import { Prisma } from '@prisma/client';

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

export const issueTicketForPaidOrder = async (
  orderId: string,
  providerRef: string,
  env: IssueEnv,
): Promise<IssueResult> => {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) throw new OrderNotFoundError(orderId);

    if (order.status === 'paid') {
      const existing = await tx.ticket.findUnique({
        where: { orderId },
        include: { event: { select: { title: true } } },
      });
      if (!existing) throw new OrderPaidWithoutTicketError(orderId);
      return {
        ticketId: existing.id,
        code: signTicketCode(existing.id, env),
        userId: existing.userId,
        eventId: existing.eventId,
        eventTitle: existing.event.title,
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
        },
      });
    } catch (err) {
      // Partial unique index on (userId, eventId) WHERE status='valid' fires
      // when a concurrent delivery inserted the sibling ticket between our
      // findFirst and create. Collapse to the same refund-needed signal.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new TicketAlreadyExistsForEventError(order.userId, order.eventId);
      }
      throw err;
    }

    await tx.order.update({
      where: { id: order.id },
      data: { status: 'paid', paidAt: new Date(), providerRef },
    });

    const event = await tx.event.findUniqueOrThrow({
      where: { id: order.eventId },
      select: { title: true },
    });
    return {
      ticketId: ticket.id,
      code: signTicketCode(ticket.id, env),
      userId: order.userId,
      eventId: order.eventId,
      eventTitle: event.title,
    };
  });
};
