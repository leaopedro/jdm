import { prisma } from '@jdm/db';

import { signQrCode } from '../../lib/qr.js';

import { signTicketCode } from './codes.js';
import { lockTicketTuple } from './locks.js';

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
    public readonly maxTicketsPerUser: number,
    public readonly existingValidCount: number,
  ) {
    super(
      `user ${userId} reached ticket limit (${existingValidCount}/${maxTicketsPerUser}) for event ${eventId}`,
    );
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

export class TicketRevokedForExtrasOnlyError extends Error {
  readonly code = 'TICKET_REVOKED_FOR_EXTRAS_ONLY' as const;
  constructor(
    public readonly orderId: string,
    public readonly userId: string,
    public readonly eventId: string,
  ) {
    super(`extras_only order ${orderId} but no valid ticket for user ${userId} event ${eventId}`);
    this.name = 'TicketRevokedForExtrasOnlyError';
  }
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

type TicketMeta = {
  extras: string[];
  carId?: string | undefined;
  licensePlate?: string | undefined;
};

function parseTicketsMeta(metadata: Record<string, string> | undefined): TicketMeta[] {
  const raw = metadata?.tickets;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((entry: unknown) => {
      if (typeof entry !== 'object' || entry === null) {
        return { extras: [] };
      }
      const obj = entry as Record<string, unknown>;
      return {
        extras: Array.isArray(obj.e) ? (obj.e as string[]) : [],
        carId: typeof obj.c === 'string' ? obj.c : undefined,
        licensePlate: typeof obj.p === 'string' ? obj.p : undefined,
      };
    });
  } catch {
    return [];
  }
}

const upsertExtraItemsFromMeta = async (
  ticketId: string,
  extraIds: string[],
  env: IssueEnv,
  tx: Tx,
): Promise<void> => {
  for (const extraId of extraIds) {
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

// Fallback for single-ticket orders without metadata: read extras from OrderExtra rows.
const upsertExtraItemsFromOrder = async (
  orderId: string,
  ticketId: string,
  env: IssueEnv,
  tx: Tx,
): Promise<void> => {
  const orderExtras = await tx.orderExtra.findMany({
    where: { orderId },
    select: { extraId: true },
  });
  await upsertExtraItemsFromMeta(
    ticketId,
    orderExtras.map((oe) => oe.extraId),
    env,
    tx,
  );
};

export const issueTicketForPaidOrder = async (
  orderId: string,
  providerRef: string,
  env: IssueEnv,
  intentMetadata?: Record<string, string>,
): Promise<IssueResult> => {
  const ticketsMeta = parseTicketsMeta(intentMetadata);

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { event: { select: { title: true, maxTicketsPerUser: true } } },
    });
    if (!order) throw new OrderNotFoundError(orderId);

    await lockTicketTuple(tx, order.userId, order.eventId);

    if (order.kind === 'extras_only') {
      return issueExtrasOnly(order, providerRef, env, tx);
    }

    if (order.status === 'paid') {
      const existing = await tx.ticket.findMany({
        where: { orderId },
        orderBy: { createdAt: 'asc' },
      });
      if (existing.length === 0) throw new OrderPaidWithoutTicketError(orderId);
      for (let i = 0; i < existing.length; i++) {
        const meta = ticketsMeta[i];
        if (meta && meta.extras.length > 0) {
          await upsertExtraItemsFromMeta(existing[i]!.id, meta.extras, env, tx);
        } else if (existing.length === 1 && ticketsMeta.length === 0) {
          await upsertExtraItemsFromOrder(orderId, existing[0]!.id, env, tx);
        }
      }
      const first = existing[0]!;
      return {
        ticketId: first.id,
        code: signTicketCode(first.id, env),
        userId: first.userId,
        eventId: first.eventId,
        eventTitle: order.event.title,
      };
    }

    if (order.status !== 'pending') {
      throw new OrderNotPendingError(orderId, order.status);
    }

    const existingValidCount = await tx.ticket.count({
      where: { userId: order.userId, eventId: order.eventId, status: 'valid' },
    });
    if (existingValidCount + order.quantity > order.event.maxTicketsPerUser) {
      throw new TicketAlreadyExistsForEventError(
        order.userId,
        order.eventId,
        order.event.maxTicketsPerUser,
        existingValidCount,
      );
    }

    const ticketCount = order.quantity;
    const tickets: { id: string }[] = [];

    for (let i = 0; i < ticketCount; i++) {
      const meta = ticketsMeta[i];
      const ticket = await tx.ticket.create({
        data: {
          orderId: order.id,
          userId: order.userId,
          eventId: order.eventId,
          tierId: order.tierId,
          source: 'purchase',
          status: 'valid',
          ...(meta?.carId ? { carId: meta.carId } : {}),
          ...(meta?.licensePlate ? { licensePlate: meta.licensePlate } : {}),
        },
      });
      tickets.push(ticket);
    }

    await tx.order.update({
      where: { id: order.id },
      data: { status: 'paid', paidAt: new Date(), ...(order.cartId ? {} : { providerRef }) },
    });

    for (let i = 0; i < tickets.length; i++) {
      const meta = ticketsMeta[i];
      if (meta && meta.extras.length > 0) {
        await upsertExtraItemsFromMeta(tickets[i]!.id, meta.extras, env, tx);
      } else if (ticketCount === 1 && ticketsMeta.length === 0) {
        await upsertExtraItemsFromOrder(orderId, tickets[0]!.id, env, tx);
      }
    }

    const first = tickets[0]!;
    return {
      ticketId: first.id,
      code: signTicketCode(first.id, env),
      userId: order.userId,
      eventId: order.eventId,
      eventTitle: order.event.title,
    };
  });
};

const issueExtrasOnly = async (
  order: {
    id: string;
    userId: string;
    eventId: string;
    status: string;
    cartId: string | null;
    event: { title: string };
  },
  providerRef: string,
  env: IssueEnv,
  tx: Tx,
): Promise<IssueResult> => {
  const ticket = await tx.ticket.findFirst({
    where: { userId: order.userId, eventId: order.eventId, status: 'valid' },
  });
  if (!ticket) {
    throw new TicketRevokedForExtrasOnlyError(order.id, order.userId, order.eventId);
  }

  if (order.status === 'paid') {
    await upsertExtraItemsFromOrder(order.id, ticket.id, env, tx);
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
    data: { status: 'paid', paidAt: new Date(), ...(order.cartId ? {} : { providerRef }) },
  });

  await upsertExtraItemsFromOrder(order.id, ticket.id, env, tx);

  return {
    ticketId: ticket.id,
    code: signTicketCode(ticket.id, env),
    userId: order.userId,
    eventId: order.eventId,
    eventTitle: order.event.title,
  };
};
