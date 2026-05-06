import { buildLoginHref } from '../../auth/redirect-intent';

export type AuthStatus = 'authenticated' | 'unauthenticated' | 'loading';

export type BuyCtaAction =
  | { kind: 'login'; href: string }
  | { kind: 'buy'; href: string }
  | { kind: 'noop' };

export interface BuyCtaInput {
  authStatus: AuthStatus;
  eventSlug: string;
  selectedTierId: string | null;
}

// Pure resolver for the event-detail "buy" CTA.
// Anonymous → route through /login with a sanitized next intent landing on
// /events/buy/:slug. Authenticated → push the buy screen with the chosen tier.
// Loading or authenticated-without-selection is a no-op (button is disabled).
export const resolveBuyCta = ({
  authStatus,
  eventSlug,
  selectedTierId,
}: BuyCtaInput): BuyCtaAction => {
  if (authStatus === 'unauthenticated') {
    return { kind: 'login', href: buildLoginHref(`/events/buy/${eventSlug}`) };
  }
  if (authStatus === 'authenticated' && selectedTierId) {
    return {
      kind: 'buy',
      href: `/events/buy/${eventSlug}?tierId=${selectedTierId}`,
    };
  }
  return { kind: 'noop' };
};

export const isBuyCtaDisabled = (input: BuyCtaInput): boolean =>
  input.authStatus === 'authenticated' && !input.selectedTierId;
