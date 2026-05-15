import { scrubSentryEvent } from '@jdm/shared/sentry-scrubber';
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  beforeSend(event) {
    return scrubSentryEvent(event);
  },
  initialScope: {
    tags: { service: 'admin', runtime: 'edge' },
  },
});
