# Railway Deployment

## One-time setup

1. **Create project** on Railway.app named `jdm-experience`
2. **Add Postgres plugin** (Railway auto-provisions `DATABASE_URL`)
3. **Add GitHub service**:
   - Root: `/` (monorepo)
   - Build: Dockerfile at `apps/api/Dockerfile`
   - Start: `sh -c "pnpm --filter @jdm/db db:deploy && node dist/server.js"`
4. **Set environment variables** in Railway Service:
   - `DATABASE_URL` (from Postgres plugin)
   - `NODE_ENV=production`, `PORT=4000`, `LOG_LEVEL=info`
   - `SENTRY_DSN` (from Sentry project)
   - `GIT_SHA=${{RAILWAY_GIT_COMMIT_SHA}}`
   - `CORS_ORIGINS` (comma-separated: admin + mobile domains)
   - Add all other secrets from `docs/secrets.md` table
5. **Generate public domain** in Railway → copy to admin/mobile env vars
6. **Enable PR environments** in Project Settings (auto-provisions per PR)

## Deploy

Push to `main` → Railway auto-deploys via GitHub webhook.

## Verify

```bash
curl https://<domain>/health
```

Should return `{"status":"ok","sha":"...",...}`

## Rollback

Railway keeps previous builds → click "Redeploy" on last good build.

For bad Prisma migration:

```bash
pnpm --filter @jdm/db exec prisma migrate resolve --rolled-back <name>
```

Run against prod `DATABASE_URL`, then redeploy.

See `docs/secrets.md` for full secrets inventory and rotation checklist.
