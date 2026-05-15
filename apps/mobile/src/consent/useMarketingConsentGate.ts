import { useCallback, useEffect, useState } from 'react';

import { hasSeenMarketingConsentPrompt, markMarketingConsentPromptSeen } from './storage';

import { grantConsent, withdrawConsent } from '~/api/consents';

const CONSENT_VERSION = '1.0';

export type MarketingConsentGate = {
  visible: boolean;
  submitting: boolean;
  handleAccept: () => Promise<void>;
  handleDecline: () => Promise<void>;
};

export const useMarketingConsentGate = (authenticated: boolean): MarketingConsentGate => {
  const [visible, setVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authenticated) return;
    let cancelled = false;
    void hasSeenMarketingConsentPrompt().then((seen) => {
      if (!cancelled && !seen) setVisible(true);
    });
    return () => {
      cancelled = true;
    };
  }, [authenticated]);

  const handleAccept = useCallback(async () => {
    setSubmitting(true);
    try {
      await grantConsent({
        purpose: 'push_marketing',
        version: CONSENT_VERSION,
        evidence: { source: 'mobile_reconsent_modal' },
      });
    } finally {
      await markMarketingConsentPromptSeen();
      setVisible(false);
      setSubmitting(false);
    }
  }, []);

  const handleDecline = useCallback(async () => {
    setSubmitting(true);
    try {
      await withdrawConsent('push_marketing');
    } catch {
      // best-effort — user has no active consent, that is fine
    } finally {
      await markMarketingConsentPromptSeen();
      setVisible(false);
      setSubmitting(false);
    }
  }, []);

  return { visible, submitting, handleAccept, handleDecline };
};
