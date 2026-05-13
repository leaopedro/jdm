import { withSentryConfig } from '@sentry/nextjs';
import { adminNextConfig } from './next.base.config.mjs';

/** @type {import('next').NextConfig} */
const config = adminNextConfig;

export default withSentryConfig(config, {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT_ADMIN,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  disableLogger: true,
});
