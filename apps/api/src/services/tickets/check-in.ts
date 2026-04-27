import { prisma } from '@jdm/db';
import type { Ticket, TicketTier, User } from '@prisma/client';

import { verifyTicketCode } from './codes.js';

export class InvalidTicketCodeError extends Error {
  readonly code = 'INVALID_TICKET_CODE';
  constructor(message = 'invalid ticket code') {
    super(message);
  }
}
export class TicketNotFoundError extends Error {
  readonly code = 'TICKET_NOT_FOUND';
  constructor(message = 'ticket not found') {
    super(message);
  }
}
export class TicketWrongEventError extends Error {
  readonly code = 'TICKET_WRONG_EVENT';
  constructor(
    readonly expectedEventId: string,
    readonly actualEventId: string,
  ) {
    super('ticket is for a different event');
  }
}
export class TicketRevokedError extends Error {
  readonly code = 'TICKET_REVOKED';
  constructor(message = 'ticket revoked') {
    super(message);
  }
}

type TicketWithRelations = Ticket & { tier: TicketTier; user: User };

export type CheckInOutcome =
  | { kind: 'admitted'; ticket: TicketWithRelations; checkedInAt: Date }
  | { kind: 'already_used'; ticket: TicketWithRelations; originalUsedAt: Date };

type CheckInEnv = { readonly TICKET_CODE_SECRET: string };

export const checkInTicket = async (
  input: { code: string; eventId: string },
  env: CheckInEnv,
): Promise<CheckInOutcome> => {
  let ticketId: string;
  try {
    ticketId = verifyTicketCode(input.code, env);
  } catch {
    throw new InvalidTicketCodeError();
  }

  const now = new Date();
  const result = await prisma.ticket.updateMany({
    where: { id: ticketId, eventId: input.eventId, status: 'valid' },
    data: { status: 'used', usedAt: now },
  });

  if (result.count === 1) {
    const ticket = await prisma.ticket.findUniqueOrThrow({
      where: { id: ticketId },
      include: { tier: true, user: true },
    });
    return { kind: 'admitted', ticket, checkedInAt: now };
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { tier: true, user: true },
  });
  if (!ticket) throw new TicketNotFoundError();
  if (ticket.eventId !== input.eventId) {
    throw new TicketWrongEventError(input.eventId, ticket.eventId);
  }
  if (ticket.status === 'revoked') throw new TicketRevokedError();
  // ticket.status === 'used' — idempotent replay
  return {
    kind: 'already_used',
    ticket,
    originalUsedAt: ticket.usedAt ?? now,
  };
};
