import { cartCopy } from '../copy/cart';

// When false, store tab is hidden and garage replaces it at nav index 1.
export const STORE_ENABLED = process.env.EXPO_PUBLIC_STORE_ENABLED !== 'false';

export const APP_TAB_SPECS = [
  { name: 'events', title: 'Eventos', visible: true },
  { name: 'store', title: 'Loja', visible: true },
  { name: 'cart', title: cartCopy.title, visible: true },
  { name: 'tickets', title: 'Ingressos', visible: true },
  { name: 'garage', title: 'Garagem', visible: false },
  { name: 'profile', title: 'Perfil', visible: true },
] as const;

export function getCartTabBadge(itemCount: number) {
  return itemCount > 0 ? cartCopy.badge(itemCount) : undefined;
}
