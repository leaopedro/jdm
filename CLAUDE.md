# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Approach

- Think before acting. Read existing files before writing code.
- Be concise in output but thorough in reasoning.
- Prefer editing over rewriting whole files.
- Do not re-read files you have already read unless the file may have changed.
- Skip files over 100KB unless explicitly required.
- Suggest running /cost when a session is running long to monitor cache ratio.
- Recommend starting a new session when switching to an unrelated task.
- Test your code before declaring done.
- No sycophantic openers or closing fluff.
- Keep solutions simple and direct.
- User instructions always override this file.

# Core Rules

Short sentences only (8-10 words max).
No filler, no preamble, no pleasantries.
Tool first. Result first. No explain unless asked.
Code stays normal. English gets compressed.

---

## Formatting

Output sounds human. Never AI-generated.
Never use em-dashes or replacement hyphens.
Avoid parenthetical clauses entirely.
Hyphens map to standard grammar only.

## Project state

Greenfield. The repo is git-initialized against `git@github.com:leaopedro/jdm.git` but has **no code and no commits yet** — Phase 0 of the roadmap (monorepo scaffold) has not started. Do not invent commands or files; verify with `ls` / `git status` before assuming anything exists.

## Canonical planning docs (local-only)

Two untracked files at the repo root are the source of truth for this project. They are listed in `.git/info/exclude` and must stay local — never `git add` them.

- `brainstorm.md` — high-level architecture brief: stack decisions, monorepo topology, feature map (F1–F12), data model sketch, payment flows, release plan (v0.1 → v0.6). Read this before proposing any design work.
- `roadmap.md` — ordered, checkbox-tracked task list per phase. **Do not change its contents except to update status markers on task lines.** Flip `[ ]` → `[~]` when work starts on-branch, `[~]` → `[x]` only when merged to `main` AND deployed, `[-]` if dropped. Updates happen as part of the merge itself, never in a follow-up. This rule is stated in the file itself and must be respected.

**Implementation plans** (`phase-N-fM-<slug>-plan.md` at repo root) are live logs, not frozen artifacts. While executing a plan you MUST tick each step's `- [ ]` checkbox the moment it is done, prefix a task's heading with `✅ ` once its final commit lands, add a one-line `> note:` when you deviate from the planned step, and edit step text in place to match reality. A stale plan misleads future agents.

When the user asks for planning or implementation, align proposals with the phasing, stack, and feature boundaries already decided in these two files. Each feature F1–F12 is sized for its own downstream implementation spec rather than being bundled.

## Architecture (planned, per brainstorm.md)

Single pnpm monorepo, TypeScript end-to-end:

```
apps/mobile   Expo managed React Native (attendees)
apps/admin    Next.js App Router (organizer web)
apps/api      Fastify + Node.js REST API
packages/db   Prisma schema + client
packages/shared  Zod schemas shared by api/mobile/admin
```

Runtime: API + Postgres on Railway, admin on Vercel, mobile via EAS Build. Media on Cloudflare R2 (client-direct pre-signed PUTs). Stripe for card/Apple Pay + recurring memberships; AbacatePay for one-time Pix. Expo Push for notifications (no WebSockets in MVP — REST + polling). Sentry on all three apps.

Load-bearing invariants (enforce in code, not comments):

- Orders only flip to `paid` from verified provider webhooks — never from client calls.
- Webhooks are idempotent: dedupe by provider event id, upsert by `provider_ref`, verify signature on every handler.
- A paid purchase order issues exactly `Order.quantity` tickets atomically; multiple valid tickets per `(user, event)` are allowed.
- Premium `Vote` weight is 2 (configurable); one-vote-per-category enforced by a DB `UNIQUE(category_id, user_id)` constraint, not app code.
- On Membership activation, backfill `Ticket` rows (`source=premium_grant`) for all currently-published future events; on each new event publish, grant to every active member; on cancel-at-period-end, stop granting but leave existing tickets valid.

## Cross-cutting requirements

- Primary language PT-BR; i18n scaffold from day one (copy in a shared locale package).
- LGPD: account deletion + data export endpoints; explicit consent capture separating transactional vs marketing push.
- Rate limiting on `/auth/*`, ticket purchase, and admin broadcast endpoints.
- Signed ticket QR codes (HMAC); pre-signed R2 URLs with short TTL; CORS locked to known origins.
- Integration tests for the API must hit a real Postgres (Testcontainers or preview DB), not mocks.
