import type { CreateWebCheckoutRequest } from '@jdm/shared/orders';
import { Platform } from 'react-native';

import { createWebCheckout } from '~/api/orders';

export const isWeb = Platform.OS === 'web';

function getReturnUrls(): { successUrl: string; cancelUrl: string } {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const base = `${origin}/events/buy/checkout-return`;
  return {
    successUrl: base,
    cancelUrl: `${base}?cancelled=true`,
  };
}

export async function startWebCheckout(
  order: Omit<CreateWebCheckoutRequest, 'successUrl' | 'cancelUrl'>,
): Promise<void> {
  const { successUrl, cancelUrl } = getReturnUrls();
  const result = await createWebCheckout({ ...order, successUrl, cancelUrl });
  sessionStorage.setItem('jdm:pendingOrderId', result.orderId);
  window.location.href = result.checkoutUrl;
}
