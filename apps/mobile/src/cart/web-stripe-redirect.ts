const PENDING_ORDER_ID_KEY = 'jdm:pendingOrderId';

export interface RedirectToStripeCheckoutInput {
  checkoutUrl: string;
  orderIds: readonly string[];
  storage?: Storage | null;
  navigate?: (url: string) => void;
}

function defaultStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function defaultNavigate(url: string): void {
  if (typeof window === 'undefined') return;
  window.location.href = url;
}

export function redirectToStripeCheckout(input: RedirectToStripeCheckoutInput): void {
  const storage = input.storage === undefined ? defaultStorage() : input.storage;
  const navigate = input.navigate ?? defaultNavigate;

  const firstOrderId = input.orderIds[0];
  if (firstOrderId && storage) {
    storage.setItem(PENDING_ORDER_ID_KEY, firstOrderId);
  }

  navigate(input.checkoutUrl);
}
