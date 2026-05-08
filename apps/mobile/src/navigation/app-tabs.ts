import { cartCopy } from '../copy/cart';

export const APP_TAB_SPECS = [
  { name: 'events', title: 'Eventos', visible: true },
  { name: 'store', title: 'Loja', visible: true },
  { name: 'tickets', title: 'Ingressos', visible: true },
  { name: 'garage', title: 'Garagem', visible: true },
  { name: 'profile', title: 'Perfil', visible: true },
  { name: 'cart', title: cartCopy.title, visible: false },
] as const;

export function getCartTabBadge(itemCount: number) {
  return itemCount > 0 ? cartCopy.badge(itemCount) : undefined;
}
