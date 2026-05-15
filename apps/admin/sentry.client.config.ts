import { scrubSentryEvent } from '@jdm/shared/sentry-scrubber';
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  beforeSend(event) {
    return scrubSentryEvent(event);
  },
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
  initialScope: {
    tags: { service: 'admin', runtime: 'client' },
  },
});
