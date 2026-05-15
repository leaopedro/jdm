import { scrubSentryEvent } from '@jdm/shared/sentry-scrubber';
import * as Sentry from '@sentry/nextjs';

const MAX_CRUMB_LEN = 200;
const PII_RE = /[^@\s]+@[^@\s]+\.[^@\s]+|\d{3}\.\d{3}\.\d{3}-\d{2}/;

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  beforeSend(event) {
    return scrubSentryEvent(event);
  },
  initialScope: {
    tags: { service: 'admin', runtime: 'edge' },
  },
  beforeSend: (event) => {
    if (event.breadcrumbs) {
      event.breadcrumbs = event.breadcrumbs.filter((crumb) => {
        if (crumb.category !== 'console') return true;
        const msg = typeof crumb.message === 'string' ? crumb.message : '';
        if (msg.length > MAX_CRUMB_LEN || PII_RE.test(msg)) return false;
        const rawArgs: unknown = crumb.data?.['arguments'];
        if (Array.isArray(rawArgs) && rawArgs.length > 0) {
          const serialized = rawArgs
            .map((a) => {
              if (typeof a === 'string') return a;
              try {
                return JSON.stringify(a);
              } catch {
                return '[unserializable]';
              }
            })
            .join(' ');
          if (serialized.length > MAX_CRUMB_LEN || PII_RE.test(serialized)) return false;
        }
        return true;
      });
    }
    return event;
  },
});
