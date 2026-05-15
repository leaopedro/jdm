import * as Sentry from '@sentry/node';
import fp from 'fastify-plugin';

import type { Env } from '../env.js';

const MAX_CRUMB_LEN = 200;
// matches email addresses or formatted CPF (e.g. 123.456.789-01)
const PII_RE = /[^@\s]+@[^@\s]+\.[^@\s]+|\d{3}\.\d{3}\.\d{3}-\d{2}/;

// eslint-disable-next-line @typescript-eslint/require-await
export const sentryPlugin = fp<{ env: Env }>(async (app, opts) => {
  if (!opts.env.SENTRY_DSN) {
    app.log.info('Sentry disabled (no SENTRY_DSN)');
    return;
  }

  Sentry.init({
    dsn: opts.env.SENTRY_DSN,
    environment: opts.env.NODE_ENV,
    release: opts.env.GIT_SHA,
    tracesSampleRate: 0.1,
    initialScope: {
      tags: { service: 'api' },
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

  app.addHook('onError', async (request, _reply, error) => {
    Sentry.withScope((scope) => {
      scope.setTag('request_id', request.id);
      Sentry.captureException(error);
    });
  });
});
