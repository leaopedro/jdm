# Railway deploy — API + Postgres

Production and per-PR preview environments for the Fastify API plus its
Postgres database. Build + start config lives in `apps/api/railway.json`
(Dockerfile builder, `/health` healthcheck, start command runs
`prisma migrate deploy` before `node dist/server.js`).

## One-time setup

1. **Project + region.** Create a Railway project named `jdm-experience`.
   Region: **South America East 1 (São Paulo / GRU, `southamerica-east1`)**.
   This requires Hobby plan or above on Railway. Do not silently fall back
   to a US region — escalate to the CTO if GRU is unavailable on the
   current plan.
2. **Postgres plugin.** Add the **Postgres** plugin in the same project.
   Railway auto-provisions `DATABASE_URL`. Confirm the plugin is also
   pinned to GRU.
3. **API service.** Add a **Service** from this GitHub repo (`leaopedro/jdm`),
   branch `main`. Root directory `/` (monorepo build). Railway picks up
   `apps/api/railway.json` automatically — no need to override build or
   start command in the UI.
4. **Environment variables.** In Service → Variables, set every secret
   listed in [`docs/secrets.md`](./secrets.md) under "Stored in: Railway".
   Bootstrap-required (must be set before first deploy):
   - `DATABASE_URL` — reference the Postgres plugin's `DATABASE_URL`.
   - `NODE_ENV=production`, `PORT=4000`, `LOG_LEVEL=info`.
   - `GIT_SHA=${{RAILWAY_GIT_COMMIT_SHA}}` — surfaces on `/health`.
   - `JWT_ACCESS_SECRET`, `REFRESH_TOKEN_PEPPER` —
     `openssl rand -base64 48` each.
   - `APP_WEB_BASE_URL`, `MAIL_FROM`, `RESEND_API_KEY`.
   - `CORS_ORIGINS=*` for the bootstrap window.
     <!-- TODO(JDMA-18): tighten to admin + mobile domains once Vercel admin domain is known -->
     Permissive `*` avoids a circular dependency on Vercel admin
     (JDMA-18) being live before this can ship.

   Other Railway-flagged secrets (Stripe, AbacatePay, R2, Sentry,
   Google/Apple client IDs) can be left empty during bootstrap if their
   features are not yet wired — the API env parser tolerates empty values
   for not-yet-active integrations.

5. **Public domain.** Networking → Generate Domain. Record the URL — this
   is `PROD_API_BASE_URL`. Paste it back into the JDMA-16 issue thread for
   the smoke test in Phase C.
6. **PR environments.** Project Settings → enable **PR Environments** so
   every pull request gets a throwaway service + Postgres branch. Confirm
   the toggle is on by opening a no-op PR (whitespace change) and watching
   Railway provision a preview within ~3 minutes.

## Deploy

Push to `main` → Railway auto-deploys via the GitHub webhook. The
configured start command runs `pnpm --filter @jdm/db db:deploy` before
booting the server, so any pending Prisma migrations apply on every
deploy.

## Manual smoke test

Run after the first prod deploy completes (Phase C of JDMA-16). Replace
`<prod-domain>` with the Railway-generated domain from step 5.

```bash
DOMAIN="https://<prod-domain>"

# 1. Health endpoint reports ok and the deployed commit SHA.
curl -fsS "$DOMAIN/health" | jq .
# Expect: {"status":"ok","sha":"<commit>","uptimeSeconds":<n>}
# - status must equal "ok"
# - sha must match the latest main commit (not "dev")
```

```bash
# 2. Migration step ran in this deploy.
# Railway → Service → Deployments → (latest) → Logs.
# Expect a line containing "prisma migrate deploy" followed by either
# "All migrations have been successfully applied." or
# "No pending migrations to apply." Either is success.
```

```bash
# 3. Postgres connectivity from the API container.
# Hit any DB-touching endpoint with a throwaway payload, e.g.:
curl -fsS -X POST "$DOMAIN/auth/signup" \
  -H 'content-type: application/json' \
  -d '{"email":"smoke+'$RANDOM'@jdmexperience.com.br","password":"smoke-test-12345","name":"Smoke"}'
# Expect: 201 Created with a user payload.
# A 5xx here means the API can't reach Postgres — investigate before
# flipping the roadmap checkbox.
```

```bash
# 4. PR environment provisioning (one-time toggle check).
# Open a whitespace-only PR. Railway should report a deploy on the PR
# within ~3 minutes. Hit the preview /health and expect the same shape.
# Close the PR without merging.
```

If all four checks pass, JDMA-16 done-when is satisfied. Flip
`plans/roadmap.md` §0.12 `[ ]` → `[x]` and the F1.1–F1.6 entries
`[~]` → `[x]` in the same follow-up PR (per `CLAUDE.md`: roadmap edits
live with the merge, not in a separate commit).

## Verification (per-deploy)

Every successful deploy should show:

- `/health` returns `{"status":"ok",...}` with `sha` matching the deployed
  commit.
- Deploy logs contain the `prisma migrate deploy` step.
- PR environments spin up within ~3 minutes of opening a PR.

## Rollback

- **Bad code.** Railway keeps previous builds — open the Service →
  Deployments view and hit "Redeploy" on the last good build.
- **Bad migration.** From a local shell pointed at prod `DATABASE_URL`:

  ```bash
  pnpm --filter @jdm/db exec prisma migrate resolve --rolled-back <name>
  ```

  Then redeploy.
