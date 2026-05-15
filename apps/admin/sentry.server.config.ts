import * as Sentry from '@sentry/nextjs';

const MAX_CRUMB_LEN = 200;
const PII_RE = /[^@\s]+@[^@\s]+\.[^@\s]+|\d{3}\.\d{3}\.\d{3}-\d{2}/;

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  initialScope: {
    tags: { service: 'admin', runtime: 'server' },
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
