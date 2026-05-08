# Engineering workflow

**Audience:** every engineer working on this repo (founding CTO, Backend, Mobile, Admin, QA, Security).

This document is the load-bearing description of how a piece of work moves
from a Paperclip issue to a deployed change. It assumes you have read
`CLAUDE.md`, `CONTRIBUTING.md`, `BUSINESS_PLAN.md`, and the relevant phase
plan in `plans/`. If anything here conflicts with `CLAUDE.md` or
`CONTRIBUTING.md`, those win — fix this doc.

## 1. The lifecycle

```
issue assigned
  → plan document on the issue (superpowers:writing-plans)
  → CTO approves plan
  → branch + implement (superpowers:test-driven-development,
                        superpowers:subagent-driven-development)
  → self-verify (superpowers:verification-before-completion)
  → request code review (superpowers:requesting-code-review)
  → CTO review
  → QA manual smoke (when user-facing)
  → merge to main
  → deploy (Railway / Vercel / EAS) — done as part of the merge, not a follow-up
  → flip roadmap checkbox `[~]` → `[x]` in the same PR
  → update handoff.md
  → close the issue with a summary comment
```

Skip nothing. If a step does not apply (e.g. no UI change → no QA step), say
so explicitly in the issue comment. Silence is not signal.

## 1.1 Git flow (hard rule)

This repository uses one release flow:

1. Engineers open branches from `main`.
2. Engineers open PRs targeting `main`.
3. The board manually merges `main` into `production`.

Non-negotiable constraints:

- Never edit files on root `main`.
- Never commit directly on `production`.
- Never commit directly on `main`.
- Never push directly to `production`.
- Never merge feature branches into `production`.
- Never open PRs targeting `production`.

Agents are blocked from editing root `main` and `production` by the
branch-safety preflight in `CLAUDE.md` plus the committed
`.claude/settings.json` PreToolUse hook. The hook inspects
`PAPERCLIP_WAKE_PAYLOAD_JSON` and fails fast when the session is running in the
repo root on `main` while the assigned issue already has a worktree under
`.claude/worktrees/<issue-id>`.

Local commits on `main` and `production` are blocked by the committed
`pre-commit` hook before `lint-staged` runs. Treat that failure as a context
error, not a hook to bypass.

If `production` is moved accidentally, stop immediately, notify the board on
the owning issue, and wait for explicit rollback instructions.

If you discover work was made in root `main` anyway:

1. Stop editing root `main`.
2. Copy or apply the leaked diff into the assigned issue worktree first.
3. Verify the worktree now contains every modified and untracked file.
4. Only then clean root `main` and document the recovery in the issue thread.

## 2. Picking up an issue

1. The issue is assigned to you. Do not work on unassigned issues. Self-assign
   only when @-mentioned and explicitly told to take it.
2. Run `paperclip` heartbeat checkout. Read the description, ancestor parent
   issue, and the relevant `plans/phase-N-fM-*.md`.
3. If the scope or success criteria are unclear, ask the CTO in a comment.
   Do not start coding against ambiguity.

## 3. Planning the task (required)

Every non-trivial task starts with a plan document on the issue. Trivial =
"a typo fix" or "tick a checkbox." Everything else gets a plan.

**Use the `superpowers:writing-plans` skill** to author it. The plan goes on
the issue as a document with key `plan` (see the `paperclip` skill's
Planning section for the API). Do not put plans in the issue description.
Do not commit plan files to the repo unless the CTO explicitly asks.

A plan should contain:

- **Goal** — one sentence of what shipping this changes.
- **Out of scope** — what you will NOT do, so reviewers do not expect it.
- **Approach** — high-level shape of the change (which apps / packages /
  routes / screens, which tables migrate).
- **Steps** — checkbox list, ordered, each step small enough to land in one
  commit. Tick boxes as you go.
- **Risks / one-way doors** — schema migrations, secret rotation, payment
  webhook changes, ticket-signing-key changes, anything irreversible.
  Escalate one-way doors to the CTO before merging.
- **Verification** — the smallest check that proves the change. For API:
  named integration tests + a curl example. For mobile / admin: the screen
  flow and what "passes" looks like.
- **Rollback** — how you revert if it goes wrong. Mandatory for any deploy.

After writing the plan, post a comment linking the document and reassign the
issue back to the CTO with status `in_review` for plan approval. Do not
implement before the CTO accepts the plan revision.

## 4. Implementing

Once the plan is accepted:

1. Branch off `main` using a Conventional-Commits-style branch name
   (`feat/f4b-pix-create-order`, `fix/auth-refresh-rotation`).
2. Tick steps in the plan document as you complete them. The plan is a live
   log, not a frozen artifact.
3. Use `superpowers:test-driven-development` for any feature or bug fix.
   Write the failing test first; commit; make it pass; commit. Integration
   tests for the API hit a real Postgres (Testcontainers / preview DB) —
   never mock the DB. This rule has burned us before; do not relitigate it.
4. Use `superpowers:subagent-driven-development` to parallelize independent
   sub-pieces (e.g. schema + Zod + handler) when the steps fan out cleanly.
   Do NOT parallelize tightly coupled changes.
5. Use `superpowers:systematic-debugging` when something breaks unexpectedly.
   Find the root cause; do not chase symptoms.
6. Commit in **logical commits as you go**, Conventional Commits, with the
   exact co-author trailer:
   ```
   Co-Authored-By: Paperclip <noreply@paperclip.ing>
   ```
7. Comment on the Paperclip issue at meaningful checkpoints (every commit
   batch, or at the end of a heartbeat). State what changed, what's next,
   who owns the next step.

### What to keep load-bearing

These invariants are checked in code, not comments. Violating any of them is
a CEO-escalation event:

- Orders only flip to `paid` from verified provider webhooks. Never from a
  client call.
- Webhooks are idempotent: dedupe by provider event id, upsert by
  `provider_ref`, verify signature on every handler.
- One valid `Ticket` per `(user, event)` regardless of source.
- Premium `Vote` weight is 2 (configurable); one-vote-per-category is
  enforced by `UNIQUE(category_id, user_id)` at the DB level.
- Ticket QR codes are HMAC-signed server-side. The signing key is one-way.
- All mutations on other users' data run through an authorization predicate
  in a service, never inline in a route.

## 5. Self-verifying before review

Before requesting review, run the **smallest meaningful check** for the
change, not the full workspace suite. The `superpowers:verification-before-completion`
skill encodes this discipline.

Default minimums:

- **API change:** `pnpm --filter @jdm/api typecheck` + the new + adjacent
  integration tests (`pnpm --filter @jdm/api test apps/api/test/<file>.test.ts`).
- **Shared package change:** `pnpm --filter @jdm/shared test`.
- **DB schema change:** `pnpm db:migrate dev --name <name>` against a clean
  local DB; commit migration; show `prisma migrate status` clean.
- **Admin change:** `pnpm --filter @jdm/admin lint && typecheck`. UI changes
  need a screenshot or recorded behavior in the issue.
- **Mobile change:** `pnpm --filter @jdm/mobile typecheck`. UI changes need a
  device or simulator screenshot.

Only run `pnpm -w typecheck` / `pnpm -w test` when the change crosses package
boundaries or before requesting review on a multi-app PR.

State the evidence in the PR description. "Tests pass" is not evidence —
"`pnpm --filter @jdm/api test apps/api/test/orders.test.ts` → 12/12 green"
is evidence.

## 6. Requesting code review (hard handoff)

Use `superpowers:requesting-code-review` to structure the request. Open a PR
with:

- Conventional Commits title.
- A short description: what changed, why, and the verification evidence.
- A link back to the Paperclip issue.
- The "Manual smoke test" section if there is a user-facing change (see
  `docs/manual-testing.md`).
- The PR checklist from `CONTRIBUTING.md`.

Reassign the Paperclip issue to the CTO with status `in_review`. Add a
comment with the PR link. This handoff is mandatory and is what wakes the
CTO; if you leave the issue assigned to yourself, review can stall.

Minimum comment content when handing off to CTO:

- PR link.
- What changed since the last review checkpoint.
- Verification evidence run on the latest commit(s).
- Explicit next owner line: `Next owner: CTO review`.

When you receive review feedback, use `superpowers:receiving-code-review`.
Verify before accepting; push back when feedback is wrong; address
unambiguous issues without ceremony. Do not silently disagree.

After pushing review fixes, repeat the exact handoff: re-request PR review,
reassign the Paperclip issue to CTO with `in_review`, and add a fresh comment
summarizing the fix set. Every fix round needs a new CTO wake signal.

## 7. QA handoff (when user-facing)

If the change affects mobile or admin behavior, hand off to QA before merge.
The PR description must include a **Manual smoke test** section in the
format documented in `docs/manual-testing.md`. The QA agent will run it,
attach evidence, and either pass or send back to you with concrete repro.

API-only changes covered by integration tests do not need QA handoff. State
that explicitly in the PR.

Until QA is hired, the implementing engineer self-verifies and states the
evidence (curl output, screenshot, log excerpt) in the PR description.

## 8. Merging

When the PR has CTO approval and (if applicable) a QA pass:

1. Squash-merge if the branch has noisy intermediate commits; otherwise
   merge the logical commits as-is.
2. Make sure the merge commit:
   - flips the matching checkbox in `plans/roadmap.md` from `[~]` to `[x]`
     **only if the change is also deployed to its target environment** —
     Railway for API, Vercel for admin, EAS for mobile;
   - updates `handoff.md` with the new state for the next engineer;
   - updates the relevant `plans/phase-N-fM-*.md` to match reality.
3. Push.
4. Verify deploy succeeded (Railway prod `/health`, Vercel preview, EAS build
   id). State the deploy evidence in the Paperclip issue.
5. For API production deploys, confirm `ABACATEPAY_DEV_WEBHOOK_ENABLED=false`
   before go-live. Treat `true` as a release blocker.

If the change is merged but not yet deployable (e.g. Railway prod is still
deferred), leave the checkbox at `[~]` and capture the deferral in the
"Deferred items" section of `roadmap.md` plus `handoff.md`.

## 9. Closing the issue

Final comment on the Paperclip issue must include:

- **Status line:** `Done` or `In review`.
- **What changed:** one paragraph.
- **How verified:** evidence (test names, screenshots, deploy URLs).
- **Next owner:** who picks up the dependent work, or `none — closed`.

Set status to `done`. The CTO confirms.

## 10. Rollback

Every deploy needs a rollback path written down before merge. Common shapes:

- **API code change (no migration):** revert the merge commit, push, Railway
  redeploys.
- **Schema migration:** Prisma migration with a paired down-migration plan
  (`prisma migrate resolve --rolled-back <migration>` plus the SQL to undo).
  Schema changes on `Order`, `Ticket`, or `Membership` are CEO-escalation;
  do not deploy without confirming the rollback plan in writing.
- **Webhook contract change:** stage the new handler behind a feature flag
  if possible, fall back to the old handler on revert.
- **Mobile:** EAS Update channel rollback, or roll back to the prior store
  build.

If you cannot articulate the rollback, you are not ready to merge.

## 11. Skills cheat-sheet

| Situation                           | Skill                                                                            |
| ----------------------------------- | -------------------------------------------------------------------------------- |
| Starting any new feature or bug fix | `superpowers:brainstorming` (before code)                                        |
| Writing the issue plan              | `superpowers:writing-plans`                                                      |
| Implementing                        | `superpowers:test-driven-development`, `superpowers:subagent-driven-development` |
| Stuck or chasing a bug              | `superpowers:systematic-debugging`                                               |
| About to claim "done"               | `superpowers:verification-before-completion`                                     |
| Asking for review                   | `superpowers:requesting-code-review`                                             |
| Receiving review                    | `superpowers:receiving-code-review`                                              |
| Wrapping a development branch       | `superpowers:finishing-a-development-branch`                                     |

When in doubt, invoke the skill. The cost is one tool call; the cost of
skipping it is rework.

## 12. What this workflow is not

- Not a substitute for thinking. Skills tell you HOW; you still own WHY.
- Not negotiable on load-bearing invariants (section 4 list, mocked DB,
  one-way doors). The rest is malleable.
- Not a release process. Releases (TestFlight builds, Play submissions,
  store reviews) live in a separate playbook the CTO maintains.
