# Railway deploy

## One-time setup

1. Create a Railway project `jdm-experience`.
2. Add a **Postgres** plugin — Railway provisions `DATABASE_URL`.
3. Add a **Service** from this GitHub repo; set:
   - Root directory: `/` (monorepo build).
   - Build: **Dockerfile** at `apps/api/Dockerfile`.
   - Start command: `sh -c "pnpm --filter @jdm/db db:deploy && node dist/server.js"`
     (runs pending Prisma migrations before boot).
4. Environment variables (Service → Variables):
   - `DATABASE_URL` — reference from the Postgres plugin.
   - `NODE_ENV=production`
   - `PORT=4000`
   - `LOG_LEVEL=info`
   - `SENTRY_DSN` — from Sentry project (Task 15).
   - `GIT_SHA` — Railway injects `RAILWAY_GIT_COMMIT_SHA`; map via:
     `GIT_SHA=${{RAILWAY_GIT_COMMIT_SHA}}`
   - `CORS_ORIGINS` — comma-separated list of admin + mobile domains.
5. Networking: generate a public domain. Copy it into admin & mobile env vars.
6. PR environments: enable **PR environments** in Project Settings so every
   PR gets a throwaway service + Postgres branch.

## Verification

- `main` push → deploy completes → `curl https://<domain>/health` returns
  `{"status":"ok","sha":"<commit>",...}`.
- Prisma migrations applied on every deploy (check logs).
- PR environment spins up within ~3 minutes of opening a PR.

## Rollback

- Railway keeps previous builds; hit "Redeploy" on the last good build.
- For a bad migration: `pnpm --filter @jdm/db exec prisma migrate resolve --rolled-back <name>` from a local shell pointed at prod `DATABASE_URL`, then redeploy.
