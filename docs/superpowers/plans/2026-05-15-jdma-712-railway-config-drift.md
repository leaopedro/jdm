# JDMA-712 Railway Config Drift Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Railway config ambiguity, preserve the working deploy path for a repo-root Railway service, and document the exact source of truth used by production deploys.

**Architecture:** Keep Railway configuration in one canonical repo-root `railway.json` because the service root directory is `/` and the Docker image starts from `/repo`. Remove the stale nested config that points at the wrong runtime path, then update the runbook to match the actual deploy path and verification flow.

**Tech Stack:** Railway deploy config, Dockerfile builder, pnpm workspace, Fastify API, Prisma migrations, Markdown runbook docs

---

### Task 1: Prove the authoritative deploy path and capture the root cause

**Files:**

- Modify: `docs/superpowers/plans/2026-05-15-jdma-712-railway-config-drift.md`
- Reference: `railway.json`
- Reference: `apps/api/railway.json`
- Reference: `apps/api/Dockerfile`
- Reference: `docs/railway.md`

- [x] **Step 1: Confirm the worktree is clean and isolated**

Run: `git status --short && git branch --show-current`
Expected: no modified files and branch `worktree-jdma-712`

- [x] **Step 2: Record the config drift evidence**

Run: `diff -u railway.json apps/api/railway.json || true`
Expected: root file uses `preDeployCommand` + `node apps/api/dist/server.js`; nested file uses inline `pnpm --filter @jdm/db db:deploy && node dist/server.js`

- [x] **Step 3: Prove the repo-root runtime path matches the Docker image**

Run: `rg -n "WORKDIR|CMD" apps/api/Dockerfile && test -f apps/api/dist/server.js && test ! -f dist/server.js`
Expected: Docker `WORKDIR /repo`, `CMD ["node", "apps/api/dist/server.js"]`, app build output present at `apps/api/dist/server.js`, no repo-root `dist/server.js`

- [x] **Step 4: Record the issue constraint around Railway logs**

Run: `curl -I -L 'https://railway.com/project/531409db-5d62-4db2-a1c0-96b59c6ce77b/service/ed15dc73-2b23-42d2-8d9c-1e7f56888b25?id=0b8a99af-d505-4996-8856-fcbf4b347582&environmentId=f8e16840-1687-44a7-9f2c-068f882f34d3'`
Expected: public HTML responds, but deployment logs remain unavailable without Railway auth

### Task 2: Remove the stale nested Railway config and align the runbook

**Files:**

- Delete: `apps/api/railway.json`
- Modify: `docs/railway.md`
- Test: none

- [x] **Step 1: Delete the stale nested config**

Delete `apps/api/railway.json`.
Expected: only repo-root `railway.json` remains, making config precedence unambiguous

- [x] **Step 2: Update the Railway runbook to name the repo-root config**

Edit `docs/railway.md` so it states:

- config lives in repo-root `railway.json`
- Railway service root directory is `/`
- start path is `node apps/api/dist/server.js`
- migration step runs through the repo-root deploy config

- [x] **Step 3: Update any stale path references in the runbook**

> note: The runbook was aligned to the existing repo-root deploy file instead of changing the authoritative deploy path. That keeps the fix scoped to ambiguity removal and documentation repair.

Replace references that describe `apps/api/railway.json` as canonical with `railway.json`.
Expected: docs and repo layout no longer disagree

### Task 3: Run the smallest proof and leave durable issue evidence

**Files:**

- Modify: `docs/superpowers/plans/2026-05-15-jdma-712-railway-config-drift.md`
- Reference: issue comment on `JDMA-712`

- [x] **Step 1: Re-run focused path proof after the edit**

Run: `test -f railway.json && test ! -f apps/api/railway.json && rg -n "railway.json|apps/api/dist/server.js|root directory" docs/railway.md railway.json`
Expected: root config present, nested config absent, docs point at repo-root config and app dist path

- [x] **Step 2: Capture the local verification caveat**

Run: `pnpm --filter @jdm/db db:generate && test -f apps/api/dist/server.js`
Expected: Prisma client refresh is possible locally; runtime path proof remains focused and does not require a full workspace suite

> note: In the fresh `jdma-712` worktree, `pnpm --filter @jdm/db db:generate` fails before execution because the worktree does not have its own `node_modules` install (`prisma: command not found`). Verification stayed focused on the touched deploy-config paths plus the shared-root proof that `node_modules/.bin/prisma` exists and the app dist path is `apps/api/dist/server.js`.

- [ ] **Step 3: Post the issue update with root cause, change, verification, and Railway follow-up**

Comment must include:

- exact repo drift found
- why repo-root `railway.json` is authoritative
- note that the linked Railway page is public HTML but deploy logs require authenticated Railway access
- rollback: restore deleted nested file and revert docs if needed
- next action: push branch / open PR / trigger Railway redeploy
