import { prisma } from '@jdm/db';

import { settleProductOrderForPaidWebhook } from '../store/pickup-entitlements.js';
import {
  issueTicketForPaidOrder,
  OrderNotFoundError,
  OrderNotPendingError,
  type IssueResult,
} from '../tickets/issue.js';

type IssueEnv = { readonly TICKET_CODE_SECRET: string };

export type SettledOrderResult =
  | { kind: 'ticket' | 'extras_only'; issued: IssueResult }
  | { kind: 'product' | 'mixed' };

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

  if (order.kind === 'product' || order.kind === 'mixed') {
    if (order.status === 'paid') {
      return { kind: order.kind };
    }
    if (order.status !== 'pending') {
      throw new OrderNotPendingError(orderId, order.status);
    }

    if (order.kind === 'product') {
      await settleProductOrderForPaidWebhook(orderId, providerRef);
    } else {
      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: 'paid',
          paidAt: new Date(),
          ...(order.cartId ? {} : { providerRef }),
        },
      });
    }

    return { kind: order.kind };
  }

  const issued = await issueTicketForPaidOrder(orderId, providerRef, env, intentMetadata);
  return { kind: order.kind, issued };
};
