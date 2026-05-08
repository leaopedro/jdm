import { describe, expect, it } from 'vitest';

import { APP_TAB_SPECS, getCartTabBadge } from './app-tabs';

describe('APP_TAB_SPECS', () => {
  it('keeps Loja in the former garage slot while hiding garage and cart from the tab bar', () => {
    expect(
      APP_TAB_SPECS.filter((tab) => tab.visible).map((tab) => `${tab.name}:${tab.title}`),
    ).toEqual(['events:Eventos', 'store:Loja', 'tickets:Ingressos', 'profile:Perfil']);

    expect(APP_TAB_SPECS.find((tab) => tab.name === 'garage')).toMatchObject({
      title: 'Garagem',
      visible: false,
    });

    expect(APP_TAB_SPECS.find((tab) => tab.name === 'cart')).toMatchObject({
      title: 'Carrinho',
      visible: false,
    });
  });
});

describe('getCartTabBadge', () => {
  it('returns no badge for an empty cart', () => {
    expect(getCartTabBadge(0)).toBeUndefined();
  });

  it('returns the live cart count badge for populated carts', () => {
    expect(getCartTabBadge(3)).toBe('3');
    expect(getCartTabBadge(12)).toBe('9+');
  });
});
