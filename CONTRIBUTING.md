# Contributing

## Branching

- Branch off `main`. Use Conventional Commit prefixes for branch names too:
  `feat/ticketing-stripe`, `fix/auth-refresh-rotation`, etc.
- Keep PRs small. One task from `roadmap.md` ≈ one PR.

## Commits

Conventional Commits only:

- `feat:` user-visible feature
- `fix:` bug fix
- `chore:` tooling, deps, config
- `docs:` docs only
- `test:` tests only
- `ci:` CI configuration
- `refactor:` no behavior change
- Scope optional but preferred: `feat(api): ...`.

## Tests

- API changes require integration tests against a real Postgres (Testcontainers).
  No mocking the database.
- Shared helpers get unit tests.
- Mobile flows covered by Maestro in later phases — for Phase 0 a typecheck
  - a manual Expo run is enough.

## PR checklist

Before requesting review:

- [ ] `pnpm lint` clean
- [ ] `pnpm typecheck` clean
- [ ] `pnpm test` clean
- [ ] Any new env var documented in `docs/secrets.md` + `.env.example`
- [ ] Any new secret registered in Railway / Vercel / EAS as appropriate
- [ ] Roadmap checkbox **not** ticked (only the merger ticks it post-deploy)

## Code style

- Strict TypeScript, no `any` unless justified with a comment.
- Zod at every system boundary (HTTP, webhooks, env parsing).
- Prefer pure functions; keep side effects at the edge (route handlers,
  service entrypoints).
- Never flip `Order.status` to `paid` outside a verified provider webhook.
- One Prisma migration per PR that touches the schema.

## Security

- Never commit secrets. `docs/secrets.md` is the source of truth for where
  each one lives.
- Webhook handlers must verify signatures and dedupe by provider event id.
- All mutations that touch other users' data require an authorization check
  — keep the "can X do Y to Z" predicate in a service, not the route.
