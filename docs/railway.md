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
   - `ABACATEPAY_DEV_WEBHOOK_ENABLED=false` by default. Set to `true`
     only for controlled internal tests that must process AbacatePay
     `devMode` webhooks in production, then revert to `false`.

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

## Metrics dashboards

Railway ships built-in dashboards per service. They are the canonical
infra view — open these first when triage points at the API or DB.

- **API service.** Railway → `jdm-experience` → `jdm` (API service) →
  **Metrics** tab. Shows CPU %, memory, network in/out, and HTTP
  request latency (P50/P95/P99). Pin this tab in the browser sidebar
  alongside the Sentry api project.
- **Postgres plugin.** Railway → `jdm-experience` → `Postgres` plugin
  → **Metrics** tab. Shows CPU %, memory, disk usage, active
  connections. Watch connections during traffic spikes — the API
  uses Prisma's default pool (single connection per request) and a
  flatlined connection count under load means the API is the
  bottleneck, not the DB.
- **Logs.** Each service has a **Logs** tab next to Metrics. Filter
  by deployment to scope to a single release. JSON log lines
  include `request_id` so you can pivot to Sentry by request id.

Both metrics tabs are alert-bookmarked in
[`docs/observability.md`](./observability.md#where-to-find-things). If
Railway adds custom dashboards (Hobby plan → Pro), pin the link there
so on-call always lands on the same view.

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

## Troubleshooting

### `TS2307: Cannot find module '@prisma/client'` during Docker build

`prisma generate` writes the client into the `packages/db` workspace
(`node_modules/.pnpm/@prisma+client@…`). With pnpm strict isolation in
the Docker build, `apps/api` cannot resolve `@prisma/client` unless it
declares it as a **direct dependency** in its own `package.json`. Local
dev may work because pnpm hoists packages in a single workspace install,
but the multi-stage Docker build does not.

**Fix:** add `"@prisma/client": "^<version>"` to
`apps/api/package.json` `dependencies` and run `pnpm install` to update
the lockfile. Keep the version range in sync with `packages/db`.

## Backup & Restore

### Backup cadence and retention

Railway Postgres backups are automatic and continuous (point-in-time):

| Plan  | Retention | Cadence         |
| ----- | --------- | --------------- |
| Hobby | 7 days    | Daily snapshots |
| Pro   | 30 days   | Daily + PITR    |

Backups are managed by Railway — no manual cron needed. Confirm the backup
toggle is enabled in Railway dashboard → Postgres service → **Backups** tab.

### RPO / RTO targets

| Target | Value | Notes                                                                            |
| ------ | ----- | -------------------------------------------------------------------------------- |
| RPO    | 24 h  | Worst-case data loss on Hobby plan (daily snapshots). Pro PITR lowers to ~5 min. |
| RTO    | 2 h   | Target time to restore + apply migrations + smoke test                           |

RPO 24 h applies on the Hobby plan. Upgrade to Pro if 24 h data loss is
unacceptable after v0.1 launch.

### Restore procedure

Two options depending on severity:

**Option A — Railway dashboard (preferred for full restores)**

1. Open Railway dashboard → Postgres service → Backups.
2. Select the backup point-in-time to restore from.
3. Click "Restore" — Railway provisions a new Postgres service with the
   restored snapshot (does **not** overwrite the live service).
4. Update the API service's `DATABASE_URL` env var to point at the new
   service, or swap the service reference if using a Railway reference.
5. Trigger a redeploy — the start command runs
   `pnpm --filter @jdm/db db:deploy` (alias for `prisma migrate deploy`)
   on startup and confirms schema state.
6. Run the row-count check below to verify data integrity.
7. **Verify the restored service's region is GRU (São Paulo)** — Railway may
   not inherit the source service's region on a new provision. Check
   Settings → General on the new service before cutting over.
8. Once satisfied, delete the old broken Postgres service.

**Option B — Manual `pg_dump` / `pg_restore` (for cross-environment
restores or when Railway UI is unavailable)**

> **Hot dump warning:** the dump runs against a live database. For v0.1 with
> low traffic this is acceptable, but ideally quiesce the API first (scale
> replicas to 0 in Railway, or put the service in maintenance mode) to ensure
> a consistent snapshot.

Requires `postgres:18` Docker image (pg_dump must match the server major
version):

```bash
# 1. Dump from source (prod public URL from Railway variables)
DUMP_FILE="jdm-backup-$(date +%Y%m%d-%H%M%S).dump"
docker run --rm \
  -e PGPASSWORD="<PGPASSWORD>" \
  -v "$PWD":/out \
  postgres:18 \
  pg_dump \
    --host=<RAILWAY_TCP_PROXY_DOMAIN> \
    --port=<RAILWAY_TCP_PROXY_PORT> \
    --username=postgres \
    --dbname=railway \
    --format=custom \
    --no-acl \
    --no-owner \
    --file=/out/"$DUMP_FILE"

# 2. Restore to target (new Railway Postgres public URL)
docker run --rm \
  -e PGPASSWORD="<TARGET_PGPASSWORD>" \
  -v "$PWD":/out \
  postgres:18 \
  pg_restore \
    --host=<TARGET_HOST> \
    --port=<TARGET_PORT> \
    --username=postgres \
    --dbname=railway \
    --no-acl \
    --no-owner \
    --clean \
    --if-exists \
    --exit-on-error \
    --verbose \
    /out/"$DUMP_FILE"

# 3. Verify schema state
DATABASE_URL="postgresql://postgres:<TARGET_PGPASSWORD>@<TARGET_HOST>:<TARGET_PORT>/railway" \
  pnpm --filter @jdm/db exec prisma migrate status
# Expect: "Database schema is up to date!"
```

Replace placeholders with values from Railway dashboard → Postgres service
→ Variables (`DATABASE_PUBLIC_URL`, `PGPASSWORD`, `RAILWAY_TCP_PROXY_DOMAIN`,
`RAILWAY_TCP_PROXY_PORT`). **Never commit these values to git.**

### Row-count verification

Run after any restore to confirm data integrity:

```sql
SELECT
  (SELECT COUNT(*) FROM "User")               AS user_count,
  (SELECT COUNT(*) FROM "Event")              AS event_count,
  (SELECT COUNT(*) FROM "Order")              AS order_count,
  (SELECT COUNT(*) FROM "Ticket")             AS ticket_count,
  (SELECT COUNT(*) FROM "TicketTier")         AS ticket_tier_count,
  (SELECT COUNT(*) FROM "Car")                AS car_count,
  (SELECT COUNT(*) FROM "AuthProvider")       AS auth_provider_count,
  (SELECT COUNT(*) FROM "PaymentWebhookEvent") AS webhook_event_count,
  (SELECT COUNT(*) FROM "Membership")         AS membership_count,
  (SELECT COUNT(*) FROM "_prisma_migrations") AS migration_count;
```

Compare against counts taken from the source DB before the restore. For
schema-only restores (no user data), all data counts will be 0 and
`migration_count` must equal the number of directories under
`packages/db/prisma/migrations/` — run
`ls packages/db/prisma/migrations/ | grep -v '\.toml' | wc -l` to get the
current number.

### Rehearsal log

| Date       | Rehearsed by | Source               | Target                   | Result                                           |
| ---------- | ------------ | -------------------- | ------------------------ | ------------------------------------------------ |
| 2026-05-01 | Atlas        | Railway prod (empty) | Docker postgres:18 local | ✓ 10/10 migrations, all tables, row counts match |

**Quarterly rehearsal schedule:** repeat this procedure every quarter
(target: Feb, May, Aug, Nov) using a non-prod Postgres. Record results in
the table above. Raise a CTO-escalation if the RTO target is missed.

### Backup & Restore Troubleshooting

| Symptom                               | Likely cause                                | Fix                                                             |
| ------------------------------------- | ------------------------------------------- | --------------------------------------------------------------- |
| `pg_dump: server version mismatch`    | Local pg_dump older than Railway Postgres   | Use `docker run postgres:18 pg_dump …` instead of local binary  |
| `pg_restore: role "postgres" missing` | Target DB has different owner               | Add `--no-owner --no-acl` flags to pg_restore                   |
| `prisma migrate status` shows drift   | Partial restore or missing migration files  | Run `prisma migrate resolve --applied <name>` or re-run restore |
| Row counts lower than expected        | Dump taken mid-transaction or mid-migration | Re-dump from a quiesced source; verify dump file size > 0       |
