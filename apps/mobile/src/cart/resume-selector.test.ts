import { describe, expect, it } from 'vitest';

import { selectResumeKind } from './resume-selector';

describe('selectResumeKind', () => {
  it('returns pix for AbacatePay orders regardless of platform', () => {
    expect(
      selectResumeKind(
        { provider: 'abacatepay' },
        { platform: 'web', storedCheckoutUrl: null, stripeAvailable: false },
      ),
    ).toBe('pix');
    expect(
      selectResumeKind(
        { provider: 'abacatepay' },
        { platform: 'native', storedCheckoutUrl: null, stripeAvailable: true },
      ),
    ).toBe('pix');
  });

  it('returns web-redirect for web Stripe order with stored URL', () => {
    expect(
      selectResumeKind(
        { provider: 'stripe' },
        {
          platform: 'web',
          storedCheckoutUrl: 'https://checkout.stripe.test/sess',
          stripeAvailable: false,
        },
      ),
    ).toBe('web-redirect');
  });

  it('returns web-unavailable for web Stripe order with no stored URL', () => {
    expect(
      selectResumeKind(
        { provider: 'stripe' },
        { platform: 'web', storedCheckoutUrl: null, stripeAvailable: false },
      ),
    ).toBe('web-unavailable');
  });

  it('returns native-stripe for native Stripe order when SDK is available', () => {
    expect(
      selectResumeKind(
        { provider: 'stripe' },
        { platform: 'native', storedCheckoutUrl: null, stripeAvailable: true },
      ),
    ).toBe('native-stripe');
  });

  it('returns none for native Stripe order when SDK is unavailable', () => {
    expect(
      selectResumeKind(
        { provider: 'stripe' },
        { platform: 'native', storedCheckoutUrl: null, stripeAvailable: false },
      ),
    ).toBe('none');
  });
});
