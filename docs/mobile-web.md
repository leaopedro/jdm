# Mobile web deploy — Vercel

Production and per-PR preview environments for the Expo client app exported
to web. Reuses the same codebase as `apps/mobile` (iOS + Android). Build
config lives in `apps/mobile/vercel.json`.

## What works on web

- Authentication (OTP login, session via cookie/localStorage — `src/auth/storage.web.ts`).
- Browsing events, event detail, ticket viewing.
- Stripe hosted checkout redirect flow (`POST /orders/checkout` → `checkout.stripe.com` → `/events/buy/checkout-return` polling).
- Check-in QR (rendered via `react-native-qrcode-svg` under `react-native-web`).
- Sentry error reporting.

## What does not work on web (intentionally stubbed or no-op)

- **Native PaymentSheet UI (`@stripe/stripe-react-native`) is still stubbed.**
  The SDK is native-only and aliased to
  `apps/mobile/src/stripe/web-stub.tsx` via `metro.config.js`, but web purchases
  now use Stripe Hosted Checkout instead of PaymentSheet.
- **Pix (AbacatePay).** Will work on web automatically once F4 ships
  (REST-only flow, no native deps).
- **Push notifications.** `usePushRegistration` early-returns when
  `Platform.OS === 'web'`. Browser push (Web Push) is a separate future
  scope.

## One-time setup

1. **Create project.** Go to vercel.com → Add New Project → import the
   GitHub repo `leaopedro/jdm`.
   - **Project name:** `jdm-mobile-web`.
   - **Root directory:** `apps/mobile` (Vercel scopes all paths relative to
     this directory).
   - **Framework preset:** Other (not Next.js).
   - **Build & Output Settings:** leave overrides empty. Vercel detects the
     repo's Turbo monorepo and runs `turbo build --filter=@jdm/mobile`,
     which invokes `apps/mobile`'s `build` script (`expo export --platform web`).
     `apps/mobile/vercel.json` sets `outputDirectory: dist` so Vercel knows
     where Expo wrote the static export.

2. **Environment variables.** Set the following in Project → Settings →
   Environment Variables. Create a value per scope (`Production`,
   `Preview`, `Development`) where they differ.

   | Variable                             | Production / Preview                            | Notes                                                      |
   | ------------------------------------ | ----------------------------------------------- | ---------------------------------------------------------- |
   | `EXPO_PUBLIC_API_BASE_URL`           | `https://jdm-production.up.railway.app`         | Required. Web client calls Railway prod API.               |
   | `EXPO_PUBLIC_SENTRY_DSN`             | Sentry mobile DSN                               | Optional but recommended.                                  |
   | `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` | leave empty                                     | Stripe is stubbed on web.                                  |
   | `APP_VARIANT`                        | `production` (Production) / `preview` (Preview) | Drives bundle id / display name suffix in `app.config.ts`. |
   | `SENTRY_ORG`                         | Sentry org slug                                 | Source-map upload during build.                            |
   | `SENTRY_PROJECT_MOBILE`              | Sentry project name                             | e.g. `mobile`.                                             |
   | `SENTRY_AUTH_TOKEN`                  | Sentry auth token                               | Source-map upload; do not expose to browser.               |

3. **Preview deploys.** Vercel enables preview deploys per PR by default.
   Every PR targeting `main` gets a unique `*.vercel.app` URL with a Vercel
   bot comment on the PR.

4. **Production domain (optional).** Project → Settings → Domains → add
   the chosen domain (e.g. `app.jdmexperience.com.br`). Vercel handles
   TLS automatically. Record the final URL and update `CORS_ORIGINS` in
   Railway (see step 5).

5. **Tighten CORS in Railway.** Once the production web domain is known,
   add it to the Railway service variables alongside the existing admin
   domain:

   ```
   CORS_ORIGINS=https://admin.jdmexperience.com.br,https://app.jdmexperience.com.br,https://jdm-admin.vercel.app,https://jdm-mobile-web.vercel.app
   ```

   Include any Vercel preview pattern if web preview builds need to hit
   the API. Redeploy the Railway service after changing this.

## Deploy

- **Preview:** automatic on every PR open/push. Vercel builds and posts a
  preview URL as a PR comment within ~2 minutes.
- **Production:** automatic on merge to `main`. Vercel promotes the build
  to production.
- **Manual redeploy:** Vercel dashboard → Deployments → Redeploy (no cache).

## Verification (smoke test after first deploy)

Open the Vercel preview URL from a PR and verify:

- [ ] `/login` loads, OTP request fires, code accepted (auth → cookie session).
- [ ] `/events` lists events fetched from Railway prod API.
- [ ] Event detail page renders (image, copy, ticket button).
- [ ] Ticket purchase redirects to `checkout.stripe.com` and returns to `/events/buy/checkout-return`.
- [ ] Return page reaches success on paid webhook and ticket appears in `/tickets`.
- [ ] Declined card path reaches failed/cancelled state and offers retry CTA.
- [ ] No console errors from `react-native-web`, Expo Router, or Sentry init.
- [ ] Sentry receives a session.

## Stripe web checkout rollout checklist (prod)

Run this list before and after promoting web checkout changes:

- [ ] Railway API has valid `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`.
- [ ] Vercel web has `EXPO_PUBLIC_API_BASE_URL` targeting the same Railway env.
- [ ] Railway `CORS_ORIGINS` contains the exact Vercel production and preview origins.
- [ ] Stripe Dashboard webhook endpoint points to `https://<api-host>/stripe/webhook` with `payment_intent.succeeded` and `payment_intent.payment_failed`.
- [ ] Happy-path purchase verified with test card `4242 4242 4242 4242`.
- [ ] Decline-path purchase verified with `4000 0000 0000 9995`.
- [ ] Ticket visibility confirmed on `/tickets` after success.
- [ ] Idempotency replay verified (`stripe events resend <evt_id>` does not duplicate ticket).

## Rollback sequence (web Stripe flow)

Use this exact order to minimize partial-state risk:

1. **Freeze web checkout entrypoint** (fast mitigation):
   - If needed, redeploy web from the last known-good commit where web purchase is disabled.
2. **Revert app/UI change** (`[JDMA-199](/JDMA/issues/JDMA-199)`):
   - Revert commit `de07c5f66cfdc961df4dca0deb1d9a1d60b9a152` (or the PR #78 merge) and deploy Vercel.
3. **Revert API checkout endpoint** (`[JDMA-197](/JDMA/issues/JDMA-197)`) only if backend behavior is faulty:
   - Revert PR #77 (commit chain ending at `91f8ea8`) and deploy Railway.
4. **Validate post-rollback safety:**
   - `POST /orders` (native) still creates PaymentIntent.
   - `/stripe/webhook` still settles native orders to `paid`.
   - No new web checkout sessions are created from web UI.

No schema migration rollback is required for this path (route-level/application-level changes only).

## Risk notes

- `Order.expiresAt` is 15 min while Stripe Checkout enforces a 30 min minimum session `expires_at`; stale sessions can remain open after our local order expiration, but webhook handlers and sweeps keep order/ticket state authoritative.
- `successUrl`/`cancelUrl` are validated to `https://` (or `http://localhost` for dev) to reduce open redirect risk.
- If webhook delivery fails, checkout-return polling remains `pending` until timeout/error; operators should check Stripe event delivery and Railway logs first.

## Troubleshooting

| Symptom                                         | Likely cause                                                     | Fix                                                                                            |
| ----------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Build fails: `Cannot find module '@jdm/shared'` | `installCommand` not running from repo root                      | Ensure `vercel.json` `buildCommand` starts with `cd ../.. && pnpm install --frozen-lockfile`.  |
| `EXPO_PUBLIC_API_BASE_URL` undefined in browser | Env var not set for the deploy scope                             | Add it under the matching scope (Preview/Production) in Vercel → Settings → Env vars.          |
| API calls return CORS errors                    | `CORS_ORIGINS` not updated in Railway after adding Vercel domain | Update Railway `CORS_ORIGINS` and redeploy.                                                    |
| Bundle includes `codegenNativeCommands` errors  | Native-only module not aliased on web                            | Add the package to the platform alias map in `apps/mobile/metro.config.js` (see Stripe).       |
| Push notification UI prompts in browser         | Missing `Platform.OS === 'web'` guard                            | Guard the call site; see `src/notifications/use-push-registration.ts`.                         |
| Sentry source maps missing                      | `SENTRY_AUTH_TOKEN` not set                                      | Set the token in Vercel env vars.                                                              |
| `POST /orders/checkout` returns 422 URL error   | Invalid return URL scheme in request                             | Ensure web app sends `https://...` return URLs (only `http://localhost` is allowed for local). |
