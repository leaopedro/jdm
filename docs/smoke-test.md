0. Prerequisites (one-time)

- Install the Stripe CLI: brew install stripe/stripe-cli/stripe
- Log in: stripe login (opens browser, pairs the CLI to your Stripe test account)
- Grab a Secret key (test mode) and Publishable key (test mode) from
  https://dashboard.stripe.com/test/apikeys
- Xcode + iOS simulator installed (Stripe RN is a native module → no Expo Go)

1. Set secrets locally

Edit apps/api/.env — add:

STRIPE*SECRET_KEY=sk_test*... # from the dashboard
STRIPE*WEBHOOK_SECRET=whsec*... # filled in at step 3
TICKET*CODE_SECRET=<generate with: openssl rand -hex 32>
STRIPE_PUBLISHABLE_KEY=pk_test*... # optional, only if you want the API to echo it

Edit apps/mobile/.env.local (create if missing) — add:

EXPO*PUBLIC_API_URL=http://localhost:4000
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test*...

2. Bring up Postgres + apply migration + seed

docker compose up -d
pnpm --filter @jdm/db prisma migrate deploy
pnpm --filter @jdm/db db:seed

3. Start Stripe CLI listener (terminal A)

stripe listen --forward-to localhost:4000/stripe/webhook

It prints > Ready! Your webhook signing secret is whsec_XXXX — copy that into
STRIPE_WEBHOOK_SECRET in apps/api/.env and restart the API (next step). Leave this running.

4. Start the API (terminal B)

pnpm --filter @jdm/api dev

Wait for server listening on :4000.

5. Start the iOS dev client (terminal C)

pnpm --filter @jdm/mobile expo run:ios

First run builds the native project (~5 min). Subsequent runs are fast.

6. Happy path — successful purchase

1. Sign up a new account, verify the email (dev shortcut: mark emailVerifiedAt manually in
   Prisma Studio, or use the emailed link — Expo server is on localhost:8081).
1. Open the seeded event from the Eventos list.
1. Tap a tier (e.g. "Geral") — the border should highlight.
1. Tap Confirmar compra.
1. Payment Sheet opens. Enter test card:

- Number: 4242 4242 4242 4242
- Expiry: any future (e.g. 12/34)
- CVC: any 3 digits
- ZIP: any 5 digits

6. Tap Pay.

Expected:

- Payment Sheet closes, "Ingresso confirmado!" alert.
- Terminal A (stripe listen) prints payment_intent.succeeded forwarded → [200 OK].
- Tap "Ver ingresso" → navigates to Ingressos tab → tap the card → QR renders, screen stays
  awake.
- DB check: SELECT status FROM "Order" WHERE user_id = ...; is paid, one row in Ticket with
  status='valid'.

7. Failure path — declined card releases the reservation

1. Go back to the same event with a different user account (the existing user now has a valid
   ticket and will be blocked).
1. Pick the same tier. Note the remaining count before.
1. Pay with decline card 4000 0000 0000 9995.

Expected:

- Payment Sheet shows a decline error.
- Terminal A prints payment_intent.payment_failed → [200 OK].
- DB: order row has status='failed', ticketTier.quantitySold is back to the pre-attempt value.

8. Idempotency — replay a delivered event

1. In the Stripe CLI output, copy the event id of a previously forwarded succeeded event (format
   evt\_...).
1. Run:
   stripe events resend <evt_id>
1. Watch the API logs.

Expected:

- Webhook returns 200 with deduped: true.
- No second Ticket row is created.

9. Refund-on-duplicate path (optional, edge case)

1. Pick a user who has no ticket for event X.
1. In Prisma Studio (pnpm --filter @jdm/db prisma studio), manually insert a Ticket row:
   userId=<that user>, eventId=<X>, tierId=<any tier of X>, source=comp, status=valid.
1. From the app, have the user buy a ticket for event X — bypass the pre-check by using Stripe
   CLI stripe trigger payment_intent.succeeded after creating a pending order, or seed an order
   directly and replay. (Easiest: skip this step — it's covered by the refunds and dedups test.)

Expected: webhook returns 200 refunded:true, stripe listen shows a refund event shortly after.

10. Sanity checks before flipping roadmap [x]

- Apple Pay button visible on the Payment Sheet (requires real iPhone or properly configured
  simulator with a Pay card).
- Force-quit the app mid-payment; confirm no orphan paid row appears.
- GET /me/tickets (hit via the Ingressos tab) shows upcoming first, past last.

Common failures

- webhook signature verification failed → STRIPE_WEBHOOK_SECRET in apps/api/.env doesn't match
  the one stripe listen printed. Re-copy and restart API.
- EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set warning in Metro logs → .env.local missing or
  Metro cache stale (pnpm --filter @jdm/mobile expo start -c).
- "Merchant identifier is invalid" on Apple Pay → expected on simulator without the provisioning
  profile; the card path still works.

✻ Crunched for 1m 2s

──────────────────────────────────────────────────────────────────────────────────────────────────
❯
──────────────────────────────────────────────────────────────────────────────────────────────────
⏵⏵ auto mode on (shift+tab to cycle) · PR #11 · ctrl+t to show tasks ⧉ In handoff.md 10. Sanity checks before flipping roadmap [x]

- Apple Pay button visible on the Payment Sheet (requires real iPhone or properly configured
  simulator with a Pay card).
- Force-quit the app mid-payment; confirm no orphan paid row appears.
- GET /me/tickets (hit via the Ingressos tab) shows upcoming first, past last.

Common failures

- webhook signature verification failed → STRIPE_WEBHOOK_SECRET in apps/api/.env doesn't match
  the one stripe listen printed. Re-copy and restart API.
- EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set warning in Metro logs → .env.local missing or
  Metro cache stale (pnpm --filter @jdm/mobile expo start -c).
- "Merchant identifier is invalid" on Apple Pay → expected on simulator without the provisioning
  profile; the card path still works.

✻ Crunched for 1m 2s

──────────────────────────────────────────────────────────────────────────────────────────────────
❯
──────────────────────────────────────────────────────────────────────────────────────────────────
⏵⏵ auto mode on (shift+tab to cycle) · PR #11 · ctrl+t to show tasks ⧉ In handoff.md

8. Idempotency — replay a delivered event

1. In the Stripe CLI output, copy the event id of a previously forwarded succeeded event (format
   evt\_...).
1. Run:
   stripe events resend <evt_id>
1. Watch the API logs.

Expected:

- Webhook returns 200 with deduped: true.
- No second Ticket row is created.

9. Refund-on-duplicate path (optional, edge case)

1. Pick a user who has no ticket for event X.
1. In Prisma Studio (pnpm --filter @jdm/db prisma studio), manually insert a Ticket row:
   userId=<that user>, eventId=<X>, tierId=<any tier of X>, source=comp, status=valid.
1. From the app, have the user buy a ticket for event X — bypass the pre-check by using Stripe
   CLI stripe trigger payment_intent.succeeded after creating a pending order, or seed an order
   directly and replay. (Easiest: skip this step — it's covered by the refunds and dedups test.)

Expected: webhook returns 200 refunded:true, stripe listen shows a refund event shortly after.

10. Sanity checks before flipping roadmap [x]

- Apple Pay button visible on the Payment Sheet (requires real iPhone or properly configured
  simulator with a Pay card).
- Force-quit the app mid-payment; confirm no orphan paid row appears.
- GET /me/tickets (hit via the Ingressos tab) shows upcoming first, past last.

Common failures

- webhook signature verification failed → STRIPE_WEBHOOK_SECRET in apps/api/.env doesn't match
  the one stripe listen printed. Re-copy and restart API.
- EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set warning in Metro logs → .env.local missing or
  Metro cache stale (pnpm --filter @jdm/mobile expo start -c).
- "Merchant identifier is invalid" on Apple Pay → expected on simulator without the provisioning
  profile; the card path still works.

✻ Crunched for 1m 2s

──────────────────────────────────────────────────────────────────────────────────────────────────
❯
──────────────────────────────────────────────────────────────────────────────────────────────────
⏵⏵ auto mode on (shift+tab to cycle) · PR #11 · ctrl+t to show tasks ⧉ In handoff.md

8. Idempotency — replay a delivered event

1. In the Stripe CLI output, copy the event id of a previously forwarded succeeded event (format
   evt\_...).
1. Run:
   stripe events resend <evt_id>
1. Watch the API logs.

Expected:

- Webhook returns 200 with deduped: true.
- No second Ticket row is created.

9. Refund-on-duplicate path (optional, edge case)

1. Pick a user who has no ticket for event X.
1. In Prisma Studio (pnpm --filter @jdm/db prisma studio), manually insert a Ticket row:
   userId=<that user>, eventId=<X>, tierId=<any tier of X>, source=comp, status=valid.
1. From the app, have the user buy a ticket for event X — bypass the pre-check by using Stripe
   CLI stripe trigger payment_intent.succeeded after creating a pending order, or seed an order
   directly and replay. (Easiest: skip this step — it's covered by the refunds and dedups test.)

Expected: webhook returns 200 refunded:true, stripe listen shows a refund event shortly after.

10. Sanity checks before flipping roadmap [x]

- Apple Pay button visible on the Payment Sheet (requires real iPhone or properly configured
  simulator with a Pay card).
- Force-quit the app mid-payment; confirm no orphan paid row appears.
- GET /me/tickets (hit via the Ingressos tab) shows upcoming first, past last.

Common failures

- webhook signature verification failed → STRIPE_WEBHOOK_SECRET in apps/api/.env doesn't match
  the one stripe listen printed. Re-copy and restart API.
- EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set warning in Metro logs → .env.local missing or
  Metro cache stale (pnpm --filter @jdm/mobile expo start -c).
- "Merchant identifier is invalid" on Apple Pay → expected on simulator without the provisioning
  profile; the card path still works.

✻ Crunched for 1m 2s

──────────────────────────────────────────────────────────────────────────────────────────────────
❯
──────────────────────────────────────────────────────────────────────────────────────────────────
⏵⏵ auto mode on (shift+tab to cycle) · PR #11 · ctrl+t to show tasks ⧉ In handoff.md 10. Sanity checks before flipping roadmap [x]

- Apple Pay button visible on the Payment Sheet (requires real iPhone or properly configured
  simulator with a Pay card).
- Force-quit the app mid-payment; confirm no orphan paid row appears.
- GET /me/tickets (hit via the Ingressos tab) shows upcoming first, past last.

Common failures

- webhook signature verification failed → STRIPE_WEBHOOK_SECRET in apps/api/.env doesn't match
  the one stripe listen printed. Re-copy and restart API.
- EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set warning in Metro logs → .env.local missing or
  Metro cache stale (pnpm --filter @jdm/mobile expo start -c).
- "Merchant identifier is invalid" on Apple Pay → expected on simulator without the provisioning
  profile; the card path still works.

✻ Crunched for 1m 2s

※ recap: F4 ticketing PR #11 is pushed with code-review fixes; tests and typecheck green. Next
action: run the manual smoke test in steps 1-8 above against a Stripe test account, then merge
and flip roadmap 4.1-4.7 to `[x]`. (disable recaps in /config)

──────────────────────────────────────────────────────────────────────────────────────────────────
❯
──────────────────────────────────────────────────────────────────────────────────────────────────
⏵⏵ auto mode on (shift+tab to cycle) · PR #11 · ctrl+t to show tasks ⧉ In .env

- GET /me/tickets (hit via the Ingressos tab) shows upcoming first, past last.

Common failures

- webhook signature verification failed → STRIPE_WEBHOOK_SECRET in apps/api/.env doesn't match
  the one stripe listen printed. Re-copy and restart API.
- EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set warning in Metro logs → .env.local missing or
  Metro cache stale (pnpm --filter @jdm/mobile expo start -c).
- "Merchant identifier is invalid" on Apple Pay → expected on simulator without the provisioning
  profile; the card path still works.

✻ Crunched for 1m 2s

※ recap: F4 ticketing PR #11 is pushed with code-review fixes; tests and typecheck green. Next
action: run the manual smoke test in steps 1-8 above against a Stripe test account, then merge
and flip roadmap 4.1-4.7 to `[x]`. (disable recaps in /config)

──────────────────────────────────────────────────────────────────────────────────────────────────
❯
──────────────────────────────────────────────────────────────────────────────────────────────────
⏵⏵ auto mode on (shift+tab to cycle) · PR #11 · ctrl+t to show tasks ⧉ In .env
stripe events resend <evt_id> 3. Watch the API logs.

Expected:

- Webhook returns 200 with deduped: true.
- No second Ticket row is created.

9. Refund-on-duplicate path (optional, edge case)

1. Pick a user who has no ticket for event X.
1. In Prisma Studio (pnpm --filter @jdm/db prisma studio), manually insert a Ticket row:
   userId=<that user>, eventId=<X>, tierId=<any tier of X>, source=comp, status=valid.
1. From the app, have the user buy a ticket for event X — bypass the pre-check by using Stripe
   CLI stripe trigger payment_intent.succeeded after creating a pending order, or seed an order
   directly and replay. (Easiest: skip this step — it's covered by the refunds and dedups test.)

Expected: webhook returns 200 refunded:true, stripe listen shows a refund event shortly after.

10. Sanity checks before flipping roadmap [x]

- Apple Pay button visible on the Payment Sheet (requires real iPhone or properly configured
  simulator with a Pay card).
- Force-quit the app mid-payment; confirm no orphan paid row appears.
- GET /me/tickets (hit via the Ingressos tab) shows upcoming first, past last.

Common failures

- webhook signature verification failed → STRIPE_WEBHOOK_SECRET in apps/api/.env doesn't match
  the one stripe listen printed. Re-copy and restart API.
- EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set warning in Metro logs → .env.local missing or
  Metro cache stale (pnpm --filter @jdm/mobile expo start -c).
- "Merchant identifier is invalid" on Apple Pay → expected on simulator without the provisioning
  profile; the card path still works.

✻ Crunched for 1m 2s

※ recap: F4 ticketing PR #11 is pushed with code-review fixes; tests and typecheck green. Next
action: run the manual smoke test in steps 1-8 above against a Stripe test account, then merge
and flip roadmap 4.1-4.7 to `[x]`. (disable recaps in /config)

──────────────────────────────────────────────────────────────────────────────────────────────────
❯
──────────────────────────────────────────────────────────────────────────────────────────────────
⏵⏵ auto mode on (shift+tab to cycle) · PR #11 · ctrl+t to show tasks ⧉ In .env
stripe events resend <evt_id> 3. Watch the API logs.

Expected:

- Webhook returns 200 with deduped: true.
- No second Ticket row is created.

9. Refund-on-duplicate path (optional, edge case)

1. Pick a user who has no ticket for event X.
1. In Prisma Studio (pnpm --filter @jdm/db prisma studio), manually insert a Ticket row:
   userId=<that user>, eventId=<X>, tierId=<any tier of X>, source=comp, status=valid.
1. From the app, have the user buy a ticket for event X — bypass the pre-check by using Stripe
   CLI stripe trigger payment_intent.succeeded after creating a pending order, or seed an order
   directly and replay. (Easiest: skip this step — it's covered by the refunds and dedups test.)

Expected: webhook returns 200 refunded:true, stripe listen shows a refund event shortly after.

10. Sanity checks before flipping roadmap [x]

- Apple Pay button visible on the Payment Sheet (requires real iPhone or properly configured
  simulator with a Pay card).
- Force-quit the app mid-payment; confirm no orphan paid row appears.
- GET /me/tickets (hit via the Ingressos tab) shows upcoming first, past last.

Common failures

- webhook signature verification failed → STRIPE_WEBHOOK_SECRET in apps/api/.env doesn't match
  the one stripe listen printed. Re-copy and restart API.
- EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set warning in Metro logs → .env.local missing or
  Metro cache stale (pnpm --filter @jdm/mobile expo start -c).
- "Merchant identifier is invalid" on Apple Pay → expected on simulator without the provisioning
  profile; the card path still works.

✻ Crunched for 1m 2s

※ recap: F4 ticketing PR #11 is pushed with code-review fixes; tests and typecheck green. Next
action: run the manual smoke test in steps 1-8 above against a Stripe test account, then merge
and flip roadmap 4.1-4.7 to `[x]`. (disable recaps in /config)

──────────────────────────────────────────────────────────────────────────────────────────────────
❯ pnpm --filter @jdm/api dev
──────────────────────────────────────────────────────────────────────────────────────────────────
⏵⏵ auto mode on (shift+tab to cycle) · PR #11 ⧉ In .env
stripe events resend <evt_id> 3. Watch the API logs.

Expected:

- Webhook returns 200 with deduped: true.
- No second Ticket row is created.

9. Refund-on-duplicate path (optional, edge case)

1. Pick a user who has no ticket for event X.
1. In Prisma Studio (pnpm --filter @jdm/db prisma studio), manually insert a Ticket row:
   userId=<that user>, eventId=<X>, tierId=<any tier of X>, source=comp, status=valid.
1. From the app, have the user buy a ticket for event X — bypass the pre-check by using Stripe
   CLI stripe trigger payment_intent.succeeded after creating a pending order, or seed an order
   directly and replay. (Easiest: skip this step — it's covered by the refunds and dedups test.)

Expected: webhook returns 200 refunded:true, stripe listen shows a refund event shortly after.

10. Sanity checks before flipping roadmap [x]

- Apple Pay button visible on the Payment Sheet (requires real iPhone or properly configured
  simulator with a Pay card).
- Force-quit the app mid-payment; confirm no orphan paid row appears.
- GET /me/tickets (hit via the Ingressos tab) shows upcoming first, past last.

Common failures

- webhook signature verification failed → STRIPE_WEBHOOK_SECRET in apps/api/.env doesn't match
  the one stripe listen printed. Re-copy and restart API.
- EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set warning in Metro logs → .env.local missing or
  Metro cache stale (pnpm --filter @jdm/mobile expo start -c).
- "Merchant identifier is invalid" on Apple Pay → expected on simulator without the provisioning
  profile; the card path still works.

✻ Crunched for 1m 2s

※ recap: F4 ticketing PR #11 is pushed with code-review fixes; tests and typecheck green. Next
action: run the manual smoke test in steps 1-8 above against a Stripe test account, then merge
and flip roadmap 4.1-4.7 to `[x]`. (disable recaps in /config)

──────────────────────────────────────────────────────────────────────────────────────────────────
❯ pnpm --filter @jdm/api dev
──────────────────────────────────────────────────────────────────────────────────────────────────
⏵⏵ auto mode on (shift+tab to cycle) · PR #11 ⧉ In .env
stripe events resend <evt_id> 3. Watch the API logs.

Expected:

- Webhook returns 200 with deduped: true.
- No second Ticket row is created.

9. Refund-on-duplicate path (optional, edge case)

1. Pick a user who has no ticket for event X.
1. In Prisma Studio (pnpm --filter @jdm/db prisma studio), manually insert a Ticket row:
   userId=<that user>, eventId=<X>, tierId=<any tier of X>, source=comp, status=valid.
1. From the app, have the user buy a ticket for event X — bypass the pre-check by using Stripe
   CLI stripe trigger payment_intent.succeeded after creating a pending order, or seed an order
   directly and replay. (Easiest: skip this step — it's covered by the refunds and dedups test.)

Expected: webhook returns 200 refunded:true, stripe listen shows a refund event shortly after.

10. Sanity checks before flipping roadmap [x]

- Apple Pay button visible on the Payment Sheet (requires real iPhone or properly configured
  simulator with a Pay card).
- Force-quit the app mid-payment; confirm no orphan paid row appears.
- GET /me/tickets (hit via the Ingressos tab) shows upcoming first, past last.

Common failures

- webhook signature verification failed → STRIPE_WEBHOOK_SECRET in apps/api/.env doesn't match
  the one stripe listen printed. Re-copy and restart API.
- EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set warning in Metro logs → .env.local missing or
  Metro cache stale (pnpm --filter @jdm/mobile expo start -c).
- "Merchant identifier is invalid" on Apple Pay → expected on simulator without the provisioning
  profile; the card path still works.

✻ Crunched for 1m 2s

※ recap: F4 ticketing PR #11 is pushed with code-review fixes; tests and typecheck green. Next
action: run the manual smoke test in steps 1-8 above against a Stripe test account, then merge
and flip roadmap 4.1-4.7 to `[x]`. (disable recaps in /config)

──────────────────────────────────────────────────────────────────────────────────────────────────
❯ pnpm --filter @jdm/api dev
──────────────────────────────────────────────────────────────────────────────────────────────────
⏵⏵ auto mode on (shift+tab to cycle) · PR #11 ⧉ In .env
profile; the card path still works.

✻ Crunched for 1m 2s

※ recap: F4 ticketing PR #11 is pushed with code-review fixes; tests and typecheck green. Next
action: run the manual smoke test in steps 1-8 above against a Stripe test account, then merge and
flip roadmap 4.1-4.7 to `[x]`. (disable recaps in /config)

─────────────────────────────────────────────────────────────────────────────────────────────────────
❯ pnpm --filter @jdm/api dev
─────────────────────────────────────────────────────────────────────────────────────────────────────
⏵⏵ auto mode on (shift+tab to cycle) · PR #11 ⧉ In .env
@jdm/mobile expo start -c).

- "Merchant identifier is invalid" on Apple Pay → expected on simulator without the provisioning profile; the card path still works.

✻ Crunched for 1m 2s

※ recap: F4 ticketing PR #11 is pushed with code-review fixes; tests and typecheck green. Next action: run the manual smoke test in
steps 1-8 above against a Stripe test account, then merge and flip roadmap 4.1-4.7 to `[x]`. (disable recaps in /config)

────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯ pnpm --filter @jdm/api dev
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⏵⏵ auto mode on (shift+tab to cycle) · PR #11 ⧉ In .env
@jdm/mobile expo start -c).

- "Merchant identifier is invalid" on Apple Pay → expected on simulator without the provisioning profile; the card path still works.

✻ Crunched for 1m 2s

※ recap: F4 ticketing PR #11 is pushed with code-review fixes; tests and typecheck green. Next action: run the manual smoke test in steps
1-8 above against a Stripe test account, then merge and flip roadmap 4.1-4.7 to `[x]`. (disable recaps in /config)

─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯ pnpm --filter @jdm/api dev
─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⏵⏵ auto mode on (shift+tab to cycle) · PR #11 ⧉ In .env
start -c).

- "Merchant identifier is invalid" on Apple Pay → expected on simulator without the provisioning profile; the card path still works.

✻ Crunched for 1m 2s

※ recap: F4 ticketing PR #11 is pushed with code-review fixes; tests and typecheck green. Next action: run the manual smoke test in steps 1-8 above
against a Stripe test account, then merge and flip roadmap 4.1-4.7 to `[x]`. (disable recaps in /config)

────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯ pnpm --filter @jdm/api dev
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⏵⏵ auto mode on (shift+tab to cycle) · PR #11 ⧉ In .env
start -c).

- "Merchant identifier is invalid" on Apple Pay → expected on simulator without the provisioning profile; the card path still works.

✻ Crunched for 1m 2s

※ recap: F4 ticketing PR #11 is pushed with code-review fixes; tests and typecheck green. Next action: run the manual smoke test in steps 1-8 above
against a Stripe test account, then merge and flip roadmap 4.1-4.7 to `[x]`. (disable recaps in /config)

───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯ pnpm --filter @jdm/api dev
───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⏵⏵ auto mode on (shift+tab to cycle) · PR #11 ⧉ In .env

- EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set warning in Metro logs → .env.local missing or Metro cache stale (pnpm --filter @jdm/mobile expo
  start -c).
- "Merchant identifier is invalid" on Apple Pay → expected on simulator without the provisioning profile; the card path still works.

✻ Crunched for 1m 2s

※ recap: F4 ticketing PR #11 is pushed with code-review fixes; tests and typecheck green. Next action: run the manual smoke test in steps 1-8 above
against a Stripe test account, then merge and flip roadmap 4.1-4.7 to `[x]`. (disable recaps in /config)

───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯ pnpm --filter @jdm/api dev
───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⏵⏵ auto mode on (shift+tab to cycle) · PR #11 ⧉ In .env
Common failures

- webhook signature verification failed → STRIPE_WEBHOOK_SECRET in apps/api/.env doesn't match the one stripe listen printed. Re-copy and restart
  API.
- EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set warning in Metro logs → .env.local missing or Metro cache stale (pnpm --filter @jdm/mobile expo
  start -c).
- "Merchant identifier is invalid" on Apple Pay → expected on simulator without the provisioning profile; the card path still works.

✻ Crunched for 1m 2s

※ recap: F4 ticketing PR #11 is pushed with code-review fixes; tests and typecheck green. Next action: run the manual smoke test in steps 1-8 above
against a Stripe test account, then merge and flip roadmap 4.1-4.7 to `[x]`. (disable recaps in /config)

───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯ pnpm --filter @jdm/api dev
───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⏵⏵ auto mode on (shift+tab to cycle) · PR #11 ⧉ In .env

Common failures

- webhook signature verification failed → STRIPE_WEBHOOK_SECRET in apps/api/.env doesn't match the one stripe listen printed. Re-copy and restart
  API.
- EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set warning in Metro logs → .env.local missing or Metro cache stale (pnpm --filter @jdm/mobile expo
  start -c).
- "Merchant identifier is invalid" on Apple Pay → expected on simulator without the provisioning profile; the card path still works.

✻ Crunched for 1m 2s

※ recap: F4 ticketing PR #11 is pushed with code-review fixes; tests and typecheck green. Next action: run the manual smoke test in steps 1-8 above
against a Stripe test account, then merge and flip roadmap 4.1-4.7 to `[x]`. (disable recaps in /config)

───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯ pnpm --filter @jdm/api dev
───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⏵⏵ auto mode on (shift+tab to cycle) · PR #11 ⧉ In .env 10. Sanity checks before flipping roadmap [x]

- Apple Pay button visible on the Payment Sheet (requires real iPhone or properly configured simulator with a Pay card).
- Force-quit the app mid-payment; confirm no orphan paid row appears.
- GET /me/tickets (hit via the Ingressos tab) shows upcoming first, past last.

Common failures

- webhook signature verification failed → STRIPE_WEBHOOK_SECRET in apps/api/.env doesn't match the one stripe listen printed. Re-copy and restart
  API.
- EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set warning in Metro logs → .env.local missing or Metro cache stale (pnpm --filter @jdm/mobile expo
  start -c).
- "Merchant identifier is invalid" on Apple Pay → expected on simulator without the provisioning profile; the card path still works.

✻ Crunched for 1m 2s

※ recap: F4 ticketing PR #11 is pushed with code-review fixes; tests and typecheck green. Next action: run the manual smoke test in steps 1-8 above
against a Stripe test account, then merge and flip roadmap 4.1-4.7 to `[x]`. (disable recaps in /config)

───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯ pnpm --filter @jdm/api dev
───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⏵⏵ auto mode on (shift+tab to cycle) · PR #11 ⧉ In .env 10. Sanity checks before flipping roadmap [x]

- Apple Pay button visible on the Payment Sheet (requires real iPhone or properly configured simulator with a Pay card).
- Force-quit the app mid-payment; confirm no orphan paid row appears.
- GET /me/tickets (hit via the Ingressos tab) shows upcoming first, past last.

Common failures

- webhook signature verification failed → STRIPE_WEBHOOK_SECRET in apps/api/.env doesn't match the one stripe listen printed. Re-copy and restart
  API.
- EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set warning in Metro logs → .env.local missing or Metro cache stale (pnpm --filter @jdm/mobile expo
  start -c).
- "Merchant identifier is invalid" on Apple Pay → expected on simulator without the provisioning profile; the card path still works.

✻ Crunched for 1m 2s

※ recap: F4 ticketing PR #11 is pushed with code-review fixes; tests and typecheck green. Next action: run the manual smoke test in steps 1-8 above
against a Stripe test account, then merge and flip roadmap 4.1-4.7 to `[x]`. (disable recaps in /config)

❯ pnpm --filter @jdm/api dev➜ jdm-experience git:(feat/f4-ticketing-stripe) ✗ pnpm --filter @jdm/mobile expo run:ios
None of the selected packages has a "expo" script

Searched for 1 pattern (ctrl+o to expand)

⏺ Use the script name:

pnpm --filter @jdm/mobile ios

(For the Metro-only JS dev server: pnpm --filter @jdm/mobile dev. ios is the one that builds + launches the native dev client you need for
Stripe.)

───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯
───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⏵⏵ auto mode on (shift+tab to cycle) · PR #11 · ctrl+t to show tasks

1. Pick a user who has no ticket for event X.
2. In Prisma Studio (pnpm --filter @jdm/db prisma studio), manually insert a Ticket row: userId=<that user>, eventId=<X>, tierId=<any tier of X>,
   source=comp, status=valid.
3. From the app, have the user buy a ticket for event X — bypass the pre-check by using Stripe CLI stripe trigger payment_intent.succeeded after
   creating a pending order, or seed an order directly and replay. (Easiest: skip this step — it's covered by the refunds and dedups test.)

Expected: webhook returns 200 refunded:true, stripe listen shows a refund event shortly after.

10. Sanity checks before flipping roadmap [x]

- Apple Pay button visible on the Payment Sheet (requires real iPhone or properly configured simulator with a Pay card).
- Force-quit the app mid-payment; confirm no orphan paid row appears.
- GET /me/tickets (hit via the Ingressos tab) shows upcoming first, past last.

Common failures

- webhook signature verification failed → STRIPE_WEBHOOK_SECRET in apps/api/.env doesn't match the one stripe listen printed. Re-copy and restart
  API.
- EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set warning in Metro logs → .env.local missing or Metro cache stale (pnpm --filter @jdm/mobile expo
  start -c).
- "Merchant identifier is invalid" on Apple Pay → expected on simulator without the provisioning profile; the card path still works.

✻ Crunched for 1m 2s

※ recap: F4 ticketing PR #11 is pushed with code-review fixes; tests and typecheck green. Next action: run the manual smoke test in steps 1-8 above
against a Stripe test account, then merge and flip roadmap 4.1-4.7 to `[x]`. (disable recaps in /config)

❯ pnpm --filter @jdm/api dev➜ jdm-experience git:(feat/f4-ticketing-stripe) ✗ pnpm --filter @jdm/mobile expo run:ios
None of the selected packages has a "expo" script

Searched for 1 pattern (ctrl+o to expand)

⏺ Use the script name:

pnpm --filter @jdm/mobile ios

(For the Metro-only JS dev server: pnpm --filter @jdm/mobile dev. ios is the one that builds + launches the native dev client you need for
Stripe.)

───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
❯
───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
⏵⏵ auto mode on (shift+tab to cycle) · PR #11 · ctrl+t to show tasks

1. Pick a user who has no ticket for event X.
2. In Prisma Studio (pnpm --filter @jdm/db prisma studio), manually insert a Ticket row: userId=<that user>, eventId=<X>, tierId=<any tier of X>,
   source=comp, status=valid.
3. From the app, have the user buy a ticket for event X — bypass the pre-check by using Stripe CLI stripe trigger payment_intent.succeeded after
   creating a pending order, or seed an order directly and replay. (Easiest: skip this step — it's covered by the refunds and dedups test.)

Expected: webhook returns 200 refunded:true, stripe listen shows a refund event shortly after.

10. Sanity checks before flipping roadmap [x]

- Apple Pay button visible on the Payment Sheet (requires real iPhone or properly configured simulator with a Pay card).
- Force-quit the app mid-payment; confirm no orphan paid row appears.
- GET /me/tickets (hit via the Ingressos tab) shows upcoming first, past last.
