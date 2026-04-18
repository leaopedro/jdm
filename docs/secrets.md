# Secrets inventory

| Secret                                                        | Used by                  | Stored in                            | Local source                        | Rotation                                                                  |
| ------------------------------------------------------------- | ------------------------ | ------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------- |
| `DATABASE_URL`                                                | api, db                  | Railway variables (prod/preview)     | `apps/api/.env`, `packages/db/.env` | Rotate by regenerating Postgres plugin creds; redeploy.                   |
| `JWT_ACCESS_SECRET`                                           | api                      | Railway                              | `apps/api/.env`                     | 32+ bytes random. Rotating invalidates all access tokens instantly.       |
| `REFRESH_TOKEN_PEPPER`                                        | api                      | Railway                              | `apps/api/.env`                     | Mixed into SHA-256 refresh-token hash. Rotating forces logout everywhere. |
| `APP_WEB_BASE_URL`                                            | api                      | Railway + local                      | `apps/api/.env`                     | Used in verify/reset email links. Immutable per env.                      |
| `MAIL_FROM`                                                   | api                      | Railway + local                      | `apps/api/.env`                     | e.g. `noreply@jdmexperience.com.br`.                                      |
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
| `GOOGLE_CLIENT_ID`                                            | api (F1 Google sign-in)  | Railway                              | `apps/api/.env`                     | Web client ID (audience for mobile + admin ID tokens).                    |
| `APPLE_CLIENT_ID`                                             | api (F1 Apple sign-in)   | Railway                              | `apps/api/.env`                     | Apple Service ID (audience) for mobile sign-in.                           |
| `EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS`                            | mobile                   | EAS secrets                          | `apps/mobile/.env`                  | iOS OAuth client ID.                                                      |
| `EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID`                        | mobile                   | EAS secrets                          | `apps/mobile/.env`                  | Android OAuth client ID.                                                  |
| `EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB`                            | mobile                   | EAS secrets                          | `apps/mobile/.env`                  | Web client ID (matches `GOOGLE_CLIENT_ID` on API).                        |

## F1 — Auth notes

Generate `JWT_ACCESS_SECRET` and `REFRESH_TOKEN_PEPPER` with `openssl rand -base64 48`. Rotate them together when compromise is suspected; doing so logs every user out (access tokens expire immediately; refresh tokens no longer hash-match).

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
