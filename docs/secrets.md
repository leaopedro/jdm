# Secrets inventory

| Secret                                                        | Used by                  | Stored in                            | Local source                        | Rotation                                                                  |
| ------------------------------------------------------------- | ------------------------ | ------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------- |
| `DATABASE_URL`                                                | api, db                  | Railway variables (prod/preview)     | `apps/api/.env`, `packages/db/.env` | Rotate by regenerating Postgres plugin creds; redeploy.                   |
| `JWT_ACCESS_SECRET`                                           | api                      | Railway                              | `apps/api/.env`                     | Rotate every 90 days; rolling restart invalidates old access tokens only. |
| `JWT_REFRESH_SECRET`                                          | api                      | Railway                              | `apps/api/.env`                     | Rotate on incident; forces logout for all users.                          |
| `SENTRY_DSN` (api)                                            | api                      | Railway                              | `apps/api/.env`                     | Regenerate in Sentry project → update Railway.                            |
| `SENTRY_DSN` (admin)                                          | admin                    | Vercel                               | `apps/admin/.env.local`             | Same.                                                                     |
| `SENTRY_DSN` (mobile)                                         | mobile                   | EAS secrets                          | `apps/mobile/.env`                  | Same. Requires OTA release.                                               |
| `SENTRY_AUTH_TOKEN`                                           | CI (source map upload)   | GitHub Actions secret + Vercel       | N/A                                 | 180 days.                                                                 |
| `STRIPE_SECRET_KEY`                                           | api                      | Railway                              | `apps/api/.env`                     | Rotate in Stripe dashboard; update Railway; redeploy.                     |
| `STRIPE_WEBHOOK_SECRET`                                       | api                      | Railway                              | `apps/api/.env`                     | Rotated whenever webhook endpoint URL changes.                            |
| `ABACATEPAY_API_KEY`                                          | api                      | Railway                              | `apps/api/.env`                     | Per AbacatePay dashboard.                                                 |
| `ABACATEPAY_WEBHOOK_SECRET`                                   | api                      | Railway                              | `apps/api/.env`                     | Same.                                                                     |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | api                      | Railway                              | `apps/api/.env`                     | Cloudflare dashboard; rotate on incident.                                 |
| `R2_BUCKET` (prod + preview)                                  | api                      | Railway                              | `apps/api/.env`                     | Immutable per environment.                                                |
| `EXPO_TOKEN`                                                  | CI (EAS build)           | GitHub Actions secret                | N/A                                 | Rotate in expo.dev.                                                       |
| `EAS_PROJECT_ID`                                              | mobile                   | Committed to `app.config.ts` via env | `apps/mobile/.env`                  | Immutable.                                                                |
| `APPLE_ID` / `ASC_APP_ID`                                     | EAS submit               | EAS secrets                          | N/A                                 | Per Apple ID lifecycle.                                                   |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`                            | EAS submit               | EAS secrets                          | N/A                                 | Regenerate in Play Console.                                               |
| `RESEND_API_KEY` (or Postmark)                                | api (email verify/reset) | Railway                              | `apps/api/.env`                     | Per provider; low traffic.                                                |
| `GOOGLE_OAUTH_AUDIENCE`                                       | api (F1 Google sign-in)  | Railway                              | `apps/api/.env`                     | Immutable unless client id changes.                                       |
| `APPLE_OAUTH_AUDIENCE`                                        | api (F1 Apple sign-in)   | Railway                              | `apps/api/.env`                     | Immutable unless bundle id changes.                                       |

## New-developer setup

1. `cp apps/api/.env.example apps/api/.env`
2. `cp apps/admin/.env.example apps/admin/.env.local`
3. `cp apps/mobile/.env.example apps/mobile/.env`
4. `cp packages/db/.env.example packages/db/.env`
5. `docker compose up -d postgres`
6. `pnpm install && pnpm --filter @jdm/db db:migrate && pnpm --filter @jdm/db db:generate`
7. `pnpm dev` — runs all three apps via Turbo.
8. Ask the team lead for dev values of any remaining secrets above (most can
   start empty for Phase 0).

## Production secret rotation checklist

- [ ] Update secret in source (Stripe/Sentry/etc.).
- [ ] Update secret in Railway / Vercel / EAS / GitHub Actions.
- [ ] Redeploy affected service.
- [ ] Verify `/health` + a canary endpoint still return 200.
- [ ] Record rotation date in this doc's change log below.

## Change log

- (append entries: `YYYY-MM-DD · secret · rotated by`)
