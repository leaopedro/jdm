import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

type Extra = { sentryDsn?: string };

const dsn = (): string | undefined => (Constants.expoConfig?.extra as Extra | undefined)?.sentryDsn;

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
