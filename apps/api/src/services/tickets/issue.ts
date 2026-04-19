import { prisma } from '@jdm/db';

import { signTicketCode } from './codes.js';

type IssueEnv = { readonly TICKET_CODE_SECRET: string };

export type IssueResult = { ticketId: string; code: string };

export const issueTicketForPaidOrder = async (
  orderId: string,
  providerRef: string,
  env: IssueEnv,
): Promise<IssueResult> => {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) throw new Error(`order ${orderId} not found`);

    if (order.status === 'paid') {
      const existing = await tx.ticket.findUnique({ where: { orderId } });
      if (!existing) throw new Error(`order ${orderId} is paid but has no ticket`);
      return { ticketId: existing.id, code: signTicketCode(existing.id, env) };
    }

    if (order.status !== 'pending') {
      throw new Error(`order is not pending (id=${orderId}, status=${order.status})`);
    }

    const conflict = await tx.ticket.findFirst({
      where: { userId: order.userId, eventId: order.eventId, status: 'valid' },
    });
    if (conflict) {
      throw new Error(`user ${order.userId} already has a valid ticket for event ${order.eventId}`);
    }

    const ticket = await tx.ticket.create({
      data: {
        orderId: order.id,
        userId: order.userId,
        eventId: order.eventId,
        tierId: order.tierId,
        source: 'purchase',
        status: 'valid',
      },
    });

    await tx.order.update({
      where: { id: order.id },
      data: { status: 'paid', paidAt: new Date(), providerRef },
    });

    return { ticketId: ticket.id, code: signTicketCode(ticket.id, env) };
  });
};
