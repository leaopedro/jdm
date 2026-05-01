# Manual testing process

**Audience:** QA engineer, implementing engineers, CTO.

This document covers how a change gets manually verified after
implementation but before merge — the gap that automated tests don't
cover (real device behavior, real payment flow, real push delivery, real
QR scan).

## 1. When manual testing is required

| Change type                                 | Manual smoke required?                       |
| ------------------------------------------- | -------------------------------------------- |
| API-only with integration tests             | No (rely on tests)                           |
| New mobile screen or flow                   | Yes — device or simulator                    |
| New admin screen or flow                    | Yes — Vercel preview                         |
| Payment flow (Stripe / AbacatePay)          | Yes — sandbox end-to-end                     |
| Webhook handler                             | Yes — replay + dedupe smoke                  |
| Push notification                           | Yes — real device                            |
| QR scan / check-in                          | Yes — admin web on a phone                   |
| LGPD endpoints (`/me/delete`, `/me/export`) | Yes — confirm purge / export                 |
| Schema migration on Order/Ticket/Membership | Yes — staging migration + rollback rehearsal |
| Internal refactor with no behavior change   | No (tests + review)                          |

When in doubt, require a smoke. Skipping a smoke that should have happened
costs more than running one that didn't strictly need to.

## 2. Authoring a manual smoke

The PR description must include a **Manual smoke test** section. Write it
so a QA agent (or any engineer) can run it cold without context.

```markdown
## Manual smoke test

### Pre-requisites

- <accounts, env vars, sandbox keys, branch deployed to where>

### Steps

1. <action> — expect <observable result>
2. <action> — expect <observable result>
   …

### Pass criteria

- All "expect" results match.
- No regressions in <adjacent flow> (one paragraph, "I also clicked X and confirmed Y still works").

### Evidence to attach

- Screenshot of <screen>.
- Server log excerpt showing <event>.
- DB query output if relevant (e.g. `SELECT status FROM "Order" WHERE id=...`).
```

Keep steps numbered and atomic ("tap X" + "see Y"), not "do the auth flow."
A QA agent who can't reproduce the steps cold has been given an
insufficient smoke.

The F4 Stripe ticketing smoke in `docs/smoke-test.md` is a good shape for
the steps and pass criteria (the file has copy-paste noise that needs a
cleanup pass — tracked separately).

## 3. Existing smoke playbooks

Living references; update these as features land.

- **F4 Stripe ticketing** — `docs/smoke-test.md` (signup → buy → QR).
  Sandbox keys + Stripe CLI `stripe listen`.
- **F6 Push notifications** — `docs/test-push.md` + the F6 manual smoke at
  the bottom of `handoff.md`. Requires an EAS dev build, not Expo Go.
- **X.6 Accessibility** — Section 10 below.

Future playbooks to author as features land:

- F4b Pix / AbacatePay sandbox flow.
- F5 admin scanner happy + reject flows.
- v0.1 end-to-end (signup → ticket → push → QR → check-in) — the gating
  test for `[x]`-flipping the v0.1 phase.
- F8 Premium subscription + grant backfill.
- LGPD `/me/delete` purge timing test.

## 4. Roles

### Engineer (implementor)

- Authors the "Manual smoke test" section in the PR.
- Self-runs it once before requesting QA. Fixes anything obviously broken.
- Hands the smoke to QA via Paperclip (assign issue to QA, status
  `in_review`, comment with PR link + smoke section).

### QA agent

- Runs the smoke cold. Does not improvise. If a step is ambiguous, asks
  the engineer to fix the smoke, not the engineer to clarify privately.
- Captures evidence (screenshots, log excerpts, DB queries) per the
  smoke's "Evidence to attach" list.
- Posts a single QA verdict comment with:
  - **Status:** `Pass` or `Fail` (no `Pass with caveats` — caveats are
    `Fail` with a clear list).
  - **Steps run:** numbered, with actual observed result next to expected.
  - **Evidence:** linked attachments.
  - **Findings (if `Fail`):** repro steps, severity (`blocker`,
    `major`, `minor`, `nit`).
- On `Fail`, reassigns the issue back to the engineer with concrete repro.
- On `Pass`, reassigns to the CTO for merge.

QA does **not** approve PRs. QA verifies behavior; the CTO (or peer
reviewer) approves the merge.

### CTO

- Owns the playbook library quality.
- Reviews smoke quality during code review — a vague smoke is a `blocking:`
  comment on the PR.
- Until QA is hired, runs smokes as part of the review (or hands to the
  CEO on user-facing changes for spot-checking).

## 5. Test data and accounts

- **Stripe:** test mode keys, card `4242 4242 4242 4242`, decline
  `4000 0000 0000 9995`. Webhook via `stripe listen --forward-to`.
- **AbacatePay:** sandbox keys. Document fixture URLs as F4b lands.
- **Test users:** seed at least one verified attendee, one organizer, one
  admin in `pnpm --filter @jdm/db db:seed`. Use throwaway email aliases
  per smoke (e.g. `qa+stripe-2026-04-29@jdm.example`).
- **Real devices:** keep one iOS + one Android dev build registered in
  EAS. Push smokes do not work on simulators reliably.
- **Production data:** never. Smokes always run against staging / preview
  / local. No exceptions.

## 6. Regression checklist (run before any v-release)

Before flipping a release version (v0.1 → TestFlight, v0.2 → public,
v0.3+):

- [ ] Signup → email verify → login on a fresh user.
- [ ] Browse events list, filter by city, open detail.
- [ ] Buy ticket via Stripe (card). QR renders.
- [ ] Buy ticket via Pix (from v0.2). QR + copy-paste, status flips on
      paid webhook.
- [ ] Receive "Ingresso confirmado" push within seconds.
- [ ] Receive T-24h reminder (when staged with a near-future event).
- [ ] Admin (organizer role) creates + publishes an event; tier counts
      respect direct-sale cap.
- [ ] Admin scans valid ticket — admit. Scans the same ticket again —
      reject (already used).
- [ ] (v0.3+) Subscribe to Premium → My Tickets backfilled.
- [ ] (v0.3+) Cancel Premium at period end → existing tickets remain.
- [ ] LGPD: `POST /me/export` returns a download link; `POST /me/delete`
      schedules purge; verify purge job at T+30 days in staging.
- [ ] No Sentry errors during the regression run.

A failed regression item blocks the release until fixed. Do not "ship and
fix forward" on a regression for v0.1 / v0.2 / v0.3 — those are the
load-bearing releases.

## 7. Bug-bash before each store submission

Before TestFlight or Play submission:

- 30-minute group bug-bash with CEO + CTO + QA on a real device build.
- Each participant logs findings as Paperclip issues with clear repro,
  severity, and a screenshot. Triage immediately after.

## 8. Smoke test failures: severity

- **Blocker:** core flow does not complete (signup, buy, scan, push,
  premium grant). Stops the release.
- **Major:** secondary flow broken or major UX regression. Stops the
  release unless explicitly waived by CEO with a captured follow-up
  issue.
- **Minor:** edge case, cosmetic, slow. Captured as a follow-up issue;
  does not stop the release.
- **Nit:** style preference, copy nitpick. Out of scope unless it's a
  legal/PT-BR copy issue.

QA labels each finding with a severity. The CTO arbitrates ambiguous
calls.

## 9. Until QA is hired

The implementing engineer self-runs the smoke and attaches evidence
(screenshot, terminal capture, DB query output) to the Paperclip issue.
The CTO spot-checks during review. The "Manual smoke test" section in
the PR is still required — it is the contract that QA will execute when
hired, retroactively for any feature still on the bench.

A v0.1 release without a hired QA agent is acceptable for the TestFlight /
internal stage. v0.2 (public launch) should have QA in the loop because
the regression cost grows with the user base.

---

## 10. Accessibility playbook (X.6)

### Prerequisites

- iOS device or simulator with VoiceOver enabled (Settings → Accessibility → VoiceOver), or
- Android device/emulator with TalkBack enabled (Settings → Accessibility → TalkBack).
- App built and running (see `docs/smoke-test.md` steps 1–5 for setup).

### Dynamic Type

1. On iOS go to Settings → Accessibility → Display & Text Size → Larger Text. Drag the slider to the largest size.
2. Open the app and walk through every screen listed below.
3. Verify text is not clipped, truncated, or overflowing containers.

Screens to check: Login, Signup, Forgot password, Events list, Event detail, Tickets list, Ticket QR, Profile, Garage list, Garage detail, New car.

### Color Contrast (WCAG AA)

All primary text uses `theme.colors.fg` (#FFFFFF or equivalent dark-mode contrast) against `theme.colors.bg`. Muted text uses `theme.colors.muted`. Confirm both meet 4.5:1 contrast ratio for body text and 3:1 for large text (18pt / 14pt bold).

Tool: use the Accessibility Inspector (Xcode) or Android's Accessibility Scanner to flag any failing pairs.

### VoiceOver / TalkBack — Signup → Buy Ticket → Show QR Flow

Run with a screen reader active. Expected behavior at each step:

**1. Welcome / Login screen**

- VoiceOver reads the title automatically on focus.
- "Esqueci minha senha" and "Ainda não tenho conta" links are announced as "link" with their label text.

**2. Signup screen**

- Each text field announces its label (e.g. "Nome", "E-mail", "Senha (mín. 10 caracteres)") when focused.
- Validation errors are appended to the field label (e.g. "Nome, error: Campo obrigatório").
- Submit button reads "Criar conta".
- "Já tenho conta" reads as a link.

**3. Email verification (verify-email-pending)**

- Screen title and body text are readable.
- Status message (resend confirmation) is announced via live region without requiring manual focus.
- Back-to-login link is announced as a link.

**4. Login screen**

- Email and password fields announce their labels.
- Submit button reads "Entrar".
- Password error on wrong credentials is read from the field label.

**5. Events list**

- Tab bar buttons announce "Upcoming", "Past", "Nearby" (or Portuguese equivalents) with `selected` state.
- Each event card announces the event title and date range; hint says "Opens event details".

**6. Event detail**

- Cover image is skipped (decorative).
- "Abrir no Maps" button is announced as a button with that label.
- Ticket tier rows announce name, price, and `selected`/`disabled` state. Sold-out tiers are announced as disabled.
- Buy button reads "Confirmar compra" or "Processando…".

**7. Tickets list**

- Each ticket card announces event title, tier name, and status (e.g. "válido").
- Hint says "Opens ticket QR code".

**8. Ticket QR screen**

- The QR box announces as an image: "QR code for [event title]".
- Status text (e.g. "válido") is readable below.

**9. Profile screen**

- Avatar button announces "Alterar foto" (or "Enviando foto…" while uploading) with `busy` state.
- All four text fields (name, bio, city, state) announce their labels.
- Save and logout buttons announce their labels.

**10. Garage**

- "Adicionar carro" button is announced.
- Each car card announces make/model/year and optional nickname as a link.
- In car detail: photo thumbnails announce "Car photo" with long-press hint.
- "Adicionar foto" button announces uploading state.
- All form fields (make, model, year, nickname) announce their labels.

**11. Reset password**

- Success confirmation text is announced via live region without requiring manual focus.

### Checklist

- [ ] Dynamic type: all screens legible at max font size.
- [ ] Contrast: all text passes WCAG AA via Accessibility Inspector / Scanner.
- [ ] VoiceOver/TalkBack can complete signup → buy ticket → show QR without visual assistance.
- [ ] All interactive elements have `accessibilityRole`, `accessibilityLabel`, and (where relevant) `accessibilityState`.
- [ ] Decorative images are marked `accessible={false}`.
- [ ] Error states are announced as part of the field label.
- [ ] Loading/busy states are announced via `accessibilityState={{ busy: true }}`.
- [ ] Dynamic status text (reset-password success, verify-email resend result) announced via `accessibilityLiveRegion="polite"`.
