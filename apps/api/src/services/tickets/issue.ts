import { prisma } from '@jdm/db';

import { signQrCode } from '../../lib/qr.js';

import { signTicketCode } from './codes.js';

type IssueEnv = { readonly TICKET_CODE_SECRET: string };

export type IssueResult = {
  ticketId: string;
  ticketIds: string[];
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

export class OrderPaidWithoutTicketError extends Error {
  readonly code = 'ORDER_PAID_WITHOUT_TICKET' as const;
  constructor(public readonly orderId: string) {
    super(`order ${orderId} is paid but has no ticket (data integrity error)`);
    this.name = 'OrderPaidWithoutTicketError';
  }
}

export class OrderPaidTicketCountMismatchError extends Error {
  readonly code = 'ORDER_PAID_TICKET_COUNT_MISMATCH' as const;
  constructor(
    public readonly orderId: string,
    public readonly expected: number,
    public readonly actual: number,
  ) {
    super(`order ${orderId} is paid but has ${actual} tickets (expected ${expected})`);
    this.name = 'OrderPaidTicketCountMismatchError';
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

type TicketMeta = { e?: string[]; c?: string; p?: string };

// Upsert one TicketExtraItem per extraId for the given ticket.
// Safe to call on redelivery — update: {} is a no-op when the row exists.
const upsertExtraItems = async (
  ticketId: string,
  extraIds: string[],
  env: IssueEnv,
  tx: Tx,
): Promise<void> => {
  for (const extraId of [...new Set(extraIds)]) {
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

function extractTicketMetadata(metadata: Record<string, string> | undefined): TicketMeta[] {
  const raw = metadata?.tickets;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed.map((entry) => {
      if (!entry || typeof entry !== 'object') return {};
      const record = entry as TicketMeta;
      const extras = Array.isArray(record.e)
        ? [
            ...new Set(
              record.e.filter((id): id is string => typeof id === 'string' && id.length > 0),
            ),
          ]
        : [];

      return {
        ...(extras.length > 0 ? { e: extras } : {}),
        ...(typeof record.c === 'string' && record.c.length > 0 ? { c: record.c } : {}),
        ...(typeof record.p === 'string' && record.p.length > 0 ? { p: record.p } : {}),
      };
    });
  } catch {
    // malformed metadata — proceed without per-ticket metadata
    return [];
  }
}

const loadIssuedTickets = async (
  order: { id: string; quantity: number },
  ticketMetas: TicketMeta[],
  env: IssueEnv,
  tx: Tx,
) => {
  const tickets = await tx.ticket.findMany({
    where: { orderId: order.id },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  if (tickets.length === 0) throw new OrderPaidWithoutTicketError(order.id);
  if (tickets.length !== order.quantity) {
    throw new OrderPaidTicketCountMismatchError(order.id, order.quantity, tickets.length);
  }

  for (let i = 0; i < tickets.length; i += 1) {
    const ticket = tickets[i]!;
    await upsertExtraItems(ticket.id, ticketMetas[i]?.e ?? [], env, tx);
  }

  return tickets;
};

const toIssueResult = (
  tickets: Array<{ id: string; userId: string; eventId: string }>,
  eventTitle: string,
  env: IssueEnv,
): IssueResult => {
  const first = tickets[0]!;
  return {
    ticketId: first.id,
    ticketIds: tickets.map((t) => t.id),
    code: signTicketCode(first.id, env),
    userId: first.userId,
    eventId: first.eventId,
    eventTitle,
  };
};

export const issueTicketForPaidOrder = async (
  orderId: string,
  providerRef: string,
  env: IssueEnv,
  intentMetadata?: Record<string, string>,
): Promise<IssueResult> => {
  const ticketMetas = extractTicketMetadata(intentMetadata);

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { event: { select: { title: true } } },
    });
    if (!order) throw new OrderNotFoundError(orderId);

    if (order.kind === 'extras_only') {
      return issueExtrasOnly(order, providerRef, env, tx);
    }

    if (ticketMetas.length > order.quantity) {
      throw new Error(
        `issueTicketForPaidOrder: tickets metadata length ${ticketMetas.length} exceeds order quantity ${order.quantity} (orderId=${order.id})`,
      );
    }

    if (order.status === 'paid') {
      const existing = await loadIssuedTickets(order, ticketMetas, env, tx);
      return toIssueResult(existing, order.event.title, env);
    }

    if (order.status !== 'pending') {
      throw new OrderNotPendingError(orderId, order.status);
    }

    // Claims the order exactly once across concurrent webhook deliveries.
    const claim = await tx.order.updateMany({
      where: { id: order.id, status: 'pending' },
      data: { status: 'paid', paidAt: new Date(), providerRef },
    });

    if (claim.count === 0) {
      const existing = await loadIssuedTickets(order, ticketMetas, env, tx);
      return toIssueResult(existing, order.event.title, env);
    }

    const created = [];
    for (let i = 0; i < order.quantity; i += 1) {
      const meta = ticketMetas[i] ?? {};
      const ticket = await tx.ticket.create({
        data: {
          orderId: order.id,
          userId: order.userId,
          eventId: order.eventId,
          tierId: order.tierId,
          source: 'purchase',
          status: 'valid',
          ...(meta.c ? { carId: meta.c } : {}),
          ...(meta.p ? { licensePlate: meta.p } : {}),
        },
      });
      await upsertExtraItems(ticket.id, meta.e ?? [], env, tx);
      created.push(ticket);
    }

    return toIssueResult(created, order.event.title, env);
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
    throw new TicketRevokedForExtrasOnlyError(order.id, order.userId, order.eventId);
  }

  if (order.status === 'paid') {
    const extras = await tx.orderExtra.findMany({
      where: { orderId: order.id },
      select: { extraId: true },
    });
    await upsertExtraItems(
      ticket.id,
      extras.map((e) => e.extraId),
      env,
      tx,
    );
    return {
      ticketId: ticket.id,
      ticketIds: [ticket.id],
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

  const extras = await tx.orderExtra.findMany({
    where: { orderId: order.id },
    select: { extraId: true },
  });
  await upsertExtraItems(
    ticket.id,
    extras.map((e) => e.extraId),
    env,
    tx,
  );

  return {
    ticketId: ticket.id,
    ticketIds: [ticket.id],
    code: signTicketCode(ticket.id, env),
    userId: order.userId,
    eventId: order.eventId,
    eventTitle: order.event.title,
  };
};
