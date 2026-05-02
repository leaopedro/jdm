import { prisma } from '@jdm/db';
import { Prisma } from '@prisma/client';

import { signQrCode } from '../../lib/qr.js';

import { signTicketCode } from './codes.js';

type GrantEnv = { readonly TICKET_CODE_SECRET: string };

export type GrantInput = {
  actorId: string;
  userId: string;
  eventId: string;
  tierId: string;
  extras?: string[];
  carId?: string;
  licensePlate?: string;
  note?: string;
};

export type GrantResult = {
  ticketId: string;
  code: string;
  extraItems: { extraId: string; code: string }[];
};

export class DuplicateTicketError extends Error {
  readonly code = 'DUPLICATE_TICKET' as const;
  constructor(
    public readonly userId: string,
    public readonly eventId: string,
  ) {
    super(`user ${userId} already has a valid ticket for event ${eventId}`);
    this.name = 'DuplicateTicketError';
  }
}

export const grantCompTicket = async (input: GrantInput, env: GrantEnv): Promise<GrantResult> => {
  const { actorId, userId, eventId, tierId, extras = [], carId, licensePlate, note } = input;

  return prisma.$transaction(async (tx) => {
    const conflict = await tx.ticket.findFirst({
      where: { userId, eventId, status: 'valid' },
    });
    if (conflict) throw new DuplicateTicketError(userId, eventId);

    let order;
    try {
      order = await tx.order.create({
        data: {
          userId,
          eventId,
          tierId,
          amountCents: 0,
          currency: 'BRL',
          method: 'card',
          provider: 'stripe',
          providerRef: null,
          status: 'paid',
          paidAt: new Date(),
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new DuplicateTicketError(userId, eventId);
      }
      throw err;
    }

    let ticket;
    try {
      ticket = await tx.ticket.create({
        data: {
          orderId: order.id,
          userId,
          eventId,
          tierId,
          source: 'comp',
          status: 'valid',
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new DuplicateTicketError(userId, eventId);
      }
      throw err;
    }

    const extraResults: { extraId: string; code: string }[] = [];
    for (const extraId of extras) {
      const item = await tx.ticketExtraItem.create({
        data: {
          ticketId: ticket.id,
          extraId,
          code: signQrCode('e', `${ticket.id}-${extraId}`, env),
          status: 'valid',
        },
      });
      extraResults.push({ extraId, code: item.code });
    }

    const metadata: Record<string, unknown> = { eventId };
    if (carId) metadata['carId'] = carId;
    if (licensePlate) metadata['licensePlate'] = licensePlate;
    if (note) metadata['note'] = note;

    await tx.adminAudit.create({
      data: {
        actorId,
        action: 'ticket.grant_comp',
        entityType: 'ticket',
        entityId: ticket.id,
        metadata: metadata as Prisma.InputJsonValue,
      },
    });

    return {
      ticketId: ticket.id,
      code: signTicketCode(ticket.id, env),
      extraItems: extraResults,
    };
  });
};
