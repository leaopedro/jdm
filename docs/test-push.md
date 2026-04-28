# F6 — Manual Push Flow Test

How to manually verify ticket-confirmed and event-reminder pushes end-to-end.

## 0. Prerequisites

- Real iOS or Android device. Expo Go does **not** deliver push reliably — needs an EAS dev build.
- API + Postgres + admin running locally.
- Stripe CLI installed and logged in (`stripe login`).
- API `.env` has `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `TICKET_CODE_SECRET`. Leave `WORKER_ENABLED=false`.

## 1. Build and install the mobile dev client

```sh
cd apps/mobile
eas build --profile development --platform ios   # or --platform android
```

Install the resulting build on the device. Expo Go will not work — `expo-notifications` is a native module.

## 2. Start the API with Stripe webhook forwarding

Two shells:

```sh
pnpm --filter @jdm/api dev
stripe listen --forward-to localhost:3030/stripe/webhook
```

Copy the `whsec_…` value Stripe prints into `STRIPE_WEBHOOK_SECRET` and restart the API.

## 3. Register a push token from the device

1. Launch the dev build, sign up, log in.
2. Accept the OS push permission prompt (fires once on the first authenticated cold start).
3. Verify in DB:

```sh
psql $DATABASE_URL -c 'select id, "userId", "expoPushToken", platform, "lastSeenAt" from "DeviceToken";'
```

Expected: one row for the user.

## 4. Test ticket-confirmed push

1. Browse to an event in the mobile app, buy a ticket with Stripe test card `4242 4242 4242 4242`.
2. Within seconds of `payment_intent.succeeded`:
   - "Ingresso confirmado" lands on the device.
   - DB check:

```sh
psql $DATABASE_URL -c $'select kind, "dedupeKey", "sentAt" from "Notification" where kind=\'ticket.confirmed\' order by "createdAt" desc limit 1;'
```

`sentAt` is set; `dedupeKey` equals the order id.

## 5. Test webhook idempotency

In the Stripe dashboard → Developers → Events → click the `payment_intent.succeeded` event → "Resend".

- No new push lands on the device.
- DB still has exactly one `Notification` row for that `(userId, kind='ticket.confirmed', dedupeKey=orderId)`.

## 6. Test "no device tokens" path

1. On the device, force-stop the app and revoke push permission in OS settings (or `DELETE` the `DeviceToken` row in DB).
2. Buy a second ticket (different event).
3. Expected: ticket issuance still succeeds (200 from webhook), and a `Notification` row is written with `sentAt = null`.

## 7. Test event reminders (T-24h)

The cron only boots in production. Two ways:

### Option A — call the runner directly (recommended)

```sh
psql $DATABASE_URL -c $'update "Event" set "startsAt" = now() + interval \'23 hours 59 minutes 45 seconds\' where id=\'<eventId>\';'
```

Then in `apps/api`:

```sh
pnpm tsx -e "import{runEventRemindersTick}from'./src/workers/event-reminders.ts';import{buildPushSender}from'./src/services/push/index.ts';import{loadEnv}from'./src/env.ts';await runEventRemindersTick({sender:buildPushSender(loadEnv())});"
```

Push lands. Run it again — no duplicate (only one `Notification` with `kind='event.reminder_24h'`, `dedupeKey=<eventId>`).

### Option B — temporarily flip the gate

In `apps/api/src/app.ts`, change `env.NODE_ENV === 'production'` to `env.NODE_ENV !== 'test'`, set `WORKER_ENABLED=true`, restart. Wait one minute. Confirm the push, then a second tick a minute later does not re-send. **Revert before committing.**

## 8. Test T-1h reminder

Same as step 7 but with `startsAt = now() + interval '59 minutes 45 seconds'`. Expect `kind='event.reminder_1h'`.

## 9. Test invalid-token pruning (optional)

1. Insert a junk `DeviceToken` row for your user with `expoPushToken='ExponentPushToken[totally-fake]'`.
2. Trigger a ticket-confirmed push (replay the webhook with a fresh `dedupeKey`).
3. Expo returns `DeviceNotRegistered` for the fake token; check DB — that row is gone, your real token is still there.

## Cleanup

- Reset the event `startsAt` to its real future value.
- If you flipped the gate in step 7B, revert it.
- Delete test `Notification` and `DeviceToken` rows for a clean slate.
