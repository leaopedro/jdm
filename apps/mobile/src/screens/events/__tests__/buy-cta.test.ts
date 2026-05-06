import { describe, expect, it } from 'vitest';

import { isBuyCtaDisabled, resolveBuyCta } from '../buy-cta';

describe('resolveBuyCta', () => {
  it('routes anonymous users through /login with the buy path as next', () => {
    const action = resolveBuyCta({
      authStatus: 'unauthenticated',
      eventSlug: 'track-day',
      selectedTierId: null,
    });
    expect(action).toEqual({
      kind: 'login',
      href: '/login?next=%2Fevents%2Fbuy%2Ftrack-day',
    });
  });

  it('ignores tier selection for anonymous users (login still required)', () => {
    const action = resolveBuyCta({
      authStatus: 'unauthenticated',
      eventSlug: 'track-day',
      selectedTierId: 'tier_1',
    });
    expect(action.kind).toBe('login');
  });

  it('builds the buy href with the selected tier when authenticated', () => {
    const action = resolveBuyCta({
      authStatus: 'authenticated',
      eventSlug: 'track-day',
      selectedTierId: 'tier_1',
    });
    expect(action).toEqual({
      kind: 'buy',
      href: '/events/buy/track-day?tierId=tier_1',
    });
  });

  it('returns noop when authenticated user has not picked a tier', () => {
    const action = resolveBuyCta({
      authStatus: 'authenticated',
      eventSlug: 'track-day',
      selectedTierId: null,
    });
    expect(action).toEqual({ kind: 'noop' });
  });

  it('returns noop while auth state is still loading', () => {
    const action = resolveBuyCta({
      authStatus: 'loading',
      eventSlug: 'track-day',
      selectedTierId: 'tier_1',
    });
    expect(action).toEqual({ kind: 'noop' });
  });
});

describe('isBuyCtaDisabled', () => {
  it('is enabled for anonymous users (button kicks off the login flow)', () => {
    expect(
      isBuyCtaDisabled({
        authStatus: 'unauthenticated',
        eventSlug: 'track-day',
        selectedTierId: null,
      }),
    ).toBe(false);
  });

  it('is disabled when authenticated without a tier selection', () => {
    expect(
      isBuyCtaDisabled({
        authStatus: 'authenticated',
        eventSlug: 'track-day',
        selectedTierId: null,
      }),
    ).toBe(true);
  });

  it('is enabled when authenticated and a tier is selected', () => {
    expect(
      isBuyCtaDisabled({
        authStatus: 'authenticated',
        eventSlug: 'track-day',
        selectedTierId: 'tier_1',
      }),
    ).toBe(false);
  });
});
