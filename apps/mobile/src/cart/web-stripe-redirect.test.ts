import { describe, expect, it, vi } from 'vitest';

import { redirectToStripeCheckout } from './web-stripe-redirect';

function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    removeItem: (key: string) => {
      map.delete(key);
    },
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

describe('redirectToStripeCheckout', () => {
  it('persists first orderId and checkout URL per order, then navigates', () => {
    const storage = fakeStorage();
    const navigate = vi.fn();

    redirectToStripeCheckout({
      checkoutUrl: 'https://checkout.stripe.test/abc',
      orderIds: ['order-1', 'order-2'],
      storage,
      navigate,
    });

    expect(storage.getItem('jdm:pendingOrderId')).toBe('order-1');
    expect(storage.getItem('jdm:pendingCheckoutUrl:order-1')).toBe(
      'https://checkout.stripe.test/abc',
    );
    expect(storage.getItem('jdm:pendingCheckoutUrl:order-2')).toBe(
      'https://checkout.stripe.test/abc',
    );
    expect(navigate).toHaveBeenCalledWith('https://checkout.stripe.test/abc');
  });

  it('still navigates when orderIds is empty (no pending id stored)', () => {
    const storage = fakeStorage();
    const navigate = vi.fn();

    redirectToStripeCheckout({
      checkoutUrl: 'https://checkout.stripe.test/abc',
      orderIds: [],
      storage,
      navigate,
    });

    expect(storage.getItem('jdm:pendingOrderId')).toBeNull();
    expect(storage.length).toBe(0);
    expect(navigate).toHaveBeenCalledWith('https://checkout.stripe.test/abc');
  });
});
