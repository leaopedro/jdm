# Vendor Register and DPA Tracker

Source of truth for LGPD task T08. This register is seeded from `LGPD_scan.md`
section 7 plus the current repo/deploy runbooks. Update it before adding any
new vendor, SDK, hosted runtime, or operator that processes JDM Experience
personal data.

Review cadence:

- Re-review every vendor at least once per year.
- Update the affected row before shipping any new vendor integration.
- Mark unresolved legal or contractual facts as `Pending`; do not invent them.

Owner legend:

- `Legal` owns DPA/SCC negotiation and contractual recordkeeping.
- `DevOps` owns hosting/runtime verification.
- `Backend` owns API-side integration inventory.
- `Admin` owns admin-web integration inventory.
- `Mobile` owns mobile/EAS/Expo integration inventory.

| Vendor         | Purpose                               | Data categories                                                           | Role                              | Country/region       | Transfer mechanism                                                              | DPA status/reference                                                                                                                                                                      | Last reviewed | Next review | Owner           |
| -------------- | ------------------------------------- | ------------------------------------------------------------------------- | --------------------------------- | -------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ----------- | --------------- |
| Stripe         | Card and Apple Pay payment processing | Buyer name, buyer email, order total, IP, payment metadata                | Independent controller + operator | US                   | Pending ANPD SCC or Stripe BR entity confirmation                               | Pending. No DPA artifact in repo. Baseline posture from `LGPD_scan.md` section 7 and `docs/secrets.md` Stripe secrets inventory.                                                          | 2026-05-15    | 2027-05-15  | Legal + Backend |
| AbacatePay     | Pix payment processing                | Buyer name, buyer email, order total, Pix/payment references              | Operator                          | Brazil               | None required for domestic processing. Confirm local DPA.                       | Pending. No DPA artifact in repo. Baseline posture from `LGPD_scan.md` section 7 and `docs/secrets.md` AbacatePay secrets inventory.                                                      | 2026-05-15    | 2027-05-15  | Legal + Backend |
| Cloudflare R2  | Object storage for user uploads       | Avatars, car photos, support attachments, feed media, object metadata     | Operator                          | Global / unspecified | Pending ANPD SCC. Confirm region-lock posture.                                  | Pending. No DPA artifact in repo. Operational evidence in `docs/secrets.md` R2 secrets inventory and `docs/r2.md`.                                                                        | 2026-05-15    | 2027-05-15  | Legal + DevOps  |
| Sentry         | Error tracking and observability      | Error traces, request metadata, device/app metadata, possible partial PII | Operator                          | US                   | Pending ANPD SCC                                                                | Pending. No DPA artifact in repo. Operational evidence in `docs/secrets.md`, `docs/observability.md`, `apps/api/package.json`, `apps/admin/package.json`, and `apps/mobile/package.json`. | 2026-05-15    | 2027-05-15  | Legal + DevOps  |
| Resend         | Transactional email delivery          | Recipient email, recipient name, verification/reset codes                 | Operator                          | US                   | Pending ANPD SCC                                                                | Pending. No DPA artifact in repo. Operational evidence in `docs/secrets.md` and `apps/api/package.json`.                                                                                  | 2026-05-15    | 2027-05-15  | Legal + Backend |
| Expo Push      | Push notification delivery            | Device token, message body, delivery metadata                             | Operator                          | US                   | Pending ANPD SCC                                                                | Pending. No DPA artifact in repo. Operational evidence in `LGPD_scan.md` section 7 and `apps/api/package.json` via `expo-server-sdk`.                                                     | 2026-05-15    | 2027-05-15  | Legal + Mobile  |
| Google OAuth   | Google sign-in                        | Name, email, Google subject identifier                                    | Independent controller            | US                   | Pending ANPD SCC or explicit Art. 33,VIII consent position                      | Pending. Terms acceptance only; no DPA artifact in repo. Operational evidence in `docs/secrets.md` and mobile/admin/api auth configuration.                                               | 2026-05-15    | 2027-05-15  | Legal + Backend |
| Apple Sign In  | Apple sign-in                         | Email, Apple subject identifier                                           | Independent controller            | US                   | Pending ANPD SCC or explicit Art. 33,VIII consent position                      | Pending. Terms acceptance only; no DPA artifact in repo. Operational evidence in `docs/secrets.md` and mobile/api auth configuration.                                                     | 2026-05-15    | 2027-05-15  | Legal + Mobile  |
| Railway        | API hosting and Postgres hosting      | All application data, logs, environment-linked operational metadata       | Operator                          | Brazil (GRU)         | None for Brazil-hosted DB. Confirm SCC if any non-BR subprocessor path applies. | Partial. Runbook evidence exists in `docs/railway.md`; no standalone DPA artifact is stored in repo.                                                                                      | 2026-05-15    | 2027-05-15  | Legal + DevOps  |
| Vercel         | Admin hosting                         | Admin session/auth state, request logs, deployment metadata               | Operator                          | US default           | Pending ANPD SCC. Revisit if region strategy changes.                           | Pending. No DPA artifact in repo. Operational evidence in `docs/vercel.md` and `docs/secrets.md`.                                                                                         | 2026-05-15    | 2027-05-15  | Legal + Admin   |
| EAS Build      | Mobile build and release pipeline     | Source code, signing certificates, build metadata, build logs             | Operator                          | US                   | Pending ANPD SCC                                                                | Pending. Terms-only posture; no DPA artifact in repo. Operational evidence in root `package.json`, `docs/eas-credentials.md`, and `docs/secrets.md`.                                      | 2026-05-15    | 2027-05-15  | Legal + Mobile  |
| GitHub Actions | CI pipeline                           | Source code, CI logs, test fixtures or test data, build metadata          | Operator                          | US                   | Pending ANPD SCC                                                                | Pending. Terms-only posture; no DPA artifact in repo. Operational evidence in root `package.json`, `.github/workflows/*`, and `docs/secrets.md` GitHub Actions secret references.         | 2026-05-15    | 2027-05-15  | Legal + DevOps  |

## Maintenance Rules

1. If a new vendor is introduced, add the row before the SDK or service lands on
   `main`.
2. If Legal confirms a DPA, SCC, or alternative Art. 33 mechanism, replace the
   corresponding `Pending` entry with the confirmed reference and date.
3. If a vendor is removed from production use, keep the row until all retained
   data is deleted or the retention basis is documented elsewhere.
