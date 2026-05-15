import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

type Extra = { sentryDsn?: string };

const dsn = (): string | undefined => (Constants.expoConfig?.extra as Extra | undefined)?.sentryDsn;

const MAX_CRUMB_LEN = 200;
const PII_RE = /[^@\s]+@[^@\s]+\.[^@\s]+|\d{3}\.\d{3}\.\d{3}-?\d{2}/;

export const initSentry = () => {
  const sentryDsn = dsn();
  if (!sentryDsn) return;
  Sentry.init({
    dsn: sentryDsn,
    debug: false,
    tracesSampleRate: 0.1,
    initialScope: {
      tags: { service: 'mobile' },
    },
    beforeSend: (event) => {
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.filter((crumb) => {
          if (crumb.type !== 'console') return true;
          const msg = typeof crumb.message === 'string' ? crumb.message : '';
          return msg.length <= MAX_CRUMB_LEN && !PII_RE.test(msg);
        });
      }
      return event;
    },
  });
};

export const captureException = (error: unknown, context: string): void => {
  if (!dsn()) {
    console.error(`[sentry-disabled] ${context}`, error);
    return;
  }
  Sentry.captureException(error, {
    tags: { service: 'mobile', context },
  });
};
