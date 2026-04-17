# Vercel deploy — admin

## One-time setup

1. Create a Vercel project `jdm-admin`, connect the GitHub repo.
2. Root directory: `apps/admin`.
3. Build settings: use `vercel.json` (already committed). Install command
   resolves at the monorepo root so pnpm workspaces work.
4. Environment variables:
   - `NEXT_PUBLIC_API_BASE_URL` — pointed at the Railway API domain.
   - `SENTRY_DSN` + `SENTRY_AUTH_TOKEN` (Task 15).
5. Preview deploys: enabled by default per PR.

## Verification

- Open a PR → Vercel preview URL loads, `/` shows API health fetched server-side.
- Production domain loads after merging to `main`.
