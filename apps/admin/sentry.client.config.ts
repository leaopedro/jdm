import * as Sentry from '@sentry/nextjs';

const MAX_CRUMB_LEN = 200;
const PII_RE = /[^@\s]+@[^@\s]+\.[^@\s]+|\d{3}\.\d{3}\.\d{3}-\d{2}/;

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
  initialScope: {
    tags: { service: 'admin', runtime: 'client' },
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
            .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
            .join(' ');
          if (serialized.length > MAX_CRUMB_LEN || PII_RE.test(serialized)) return false;
        }
        return true;
      });
    }
    return event;
  },
});
