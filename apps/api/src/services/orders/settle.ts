import { prisma } from '@jdm/db';

import { assignEventPickupTicket } from '../store/event-pickup.js';
import {
  issueTicketForPaidOrder,
  issueTicketsForMixedOrder,
  OrderNotFoundError,
  OrderNotPendingError,
  type IssueResult,
} from '../tickets/issue.js';

type IssueEnv = { readonly TICKET_CODE_SECRET: string };

export type SettledOrderResult =
  | { kind: 'ticket' | 'extras_only'; issued: IssueResult }
  | { kind: 'product' | 'mixed'; issued?: IssueResult[] };

export const settlePaidOrder = async (
  orderId: string,
  providerRef: string,
  env: IssueEnv,
  intentMetadata?: Record<string, string>,
): Promise<SettledOrderResult> => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { kind: true, status: true, cartId: true },
  });
  if (!order) throw new OrderNotFoundError(orderId);

  if (order.kind === 'mixed') {
    if (order.status === 'paid') {
      await assignEventPickupTicket(orderId);
      return { kind: 'mixed' };
    }
    if (order.status !== 'pending') {
      throw new OrderNotPendingError(orderId, order.status);
    }
    const issued = await issueTicketsForMixedOrder(orderId, providerRef, env);
    await assignEventPickupTicket(orderId);
    return { kind: 'mixed', issued };
  }

  if (order.kind === 'product') {
    if (order.status === 'paid') {
      await assignEventPickupTicket(orderId);
      return { kind: order.kind };
    }
    if (order.status !== 'pending') {
      throw new OrderNotPendingError(orderId, order.status);
    }

    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'paid',
        paidAt: new Date(),
        ...(order.cartId ? {} : { providerRef }),
      },
    });

    await assignEventPickupTicket(orderId);
    return { kind: order.kind };
  }

  const issued = await issueTicketForPaidOrder(orderId, providerRef, env, intentMetadata);
  return { kind: order.kind, issued };
};
