import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

type Extra = { sentryDsn?: string };

export const initSentry = () => {
  const dsn = (Constants.expoConfig?.extra as Extra | undefined)?.sentryDsn;
  if (!dsn) return;
  Sentry.init({
    dsn,
    debug: false,
    tracesSampleRate: 0.1,
  });
};
