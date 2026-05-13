// Decides how the orders list should resume a pending order's payment.
//
// Stripe Checkout Session orders created from web have no PaymentIntent
// (Order.providerRef = null), so the server's /orders/:id/resume returns
// 409 OrderNotPending for them. On web we instead reopen the hosted
// checkout URL captured at creation time. Pix and native Stripe paths
// are unchanged.

import type { MyOrder } from '@jdm/shared/orders';

export type ResumeKind = 'pix' | 'web-redirect' | 'web-unavailable' | 'native-stripe' | 'none';

export interface ResumeContext {
  platform: 'web' | 'native';
  storedCheckoutUrl: string | null;
  stripeAvailable: boolean;
}

export function selectResumeKind(order: Pick<MyOrder, 'provider'>, ctx: ResumeContext): ResumeKind {
  if (order.provider === 'abacatepay') return 'pix';
  if (ctx.platform === 'web') {
    return ctx.storedCheckoutUrl ? 'web-redirect' : 'web-unavailable';
  }
  if (ctx.stripeAvailable) return 'native-stripe';
  return 'none';
}
