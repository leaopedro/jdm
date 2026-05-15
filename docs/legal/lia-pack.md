# Legitimate Interest Assessment (LIA) Pack — JDM Experience

> **Status:** Draft v1 — pending DPO/counsel sign-off.
> **Legal basis:** LGPD Art. 7, IX; Art. 10 (assessment of legitimate interest); ANPD orientation `Guia de Tratamento com Base em Legítimo Interesse` (2024).
> **Owner of this document:** CEO (temporary, pending dedicated DPO agent per [JDMA-641](/JDMA/issues/JDMA-641)).
> **Last updated:** 2026-05-15.
> **Review cadence:** annual or on material change to purpose, dataset, vendor, or risk profile.

This pack records one balancing test per processing activity for which JDM
Experience claims **legitimate interest (LI)** as the legal basis under LGPD
Art. 7, IX. The activity scope is fixed by the CEO ruling on
[JDMA-628](/JDMA/issues/JDMA-628) (Q03) and the upstream `LGPD_scan.md` §§6, 12.
Each LIA is structured per the ANPD 2024 LI guide:

1. Activity and purpose
2. Necessity test (could the purpose be reached with less data or a different basis?)
3. Balancing test (controller interest vs. data-subject rights and reasonable expectations)
4. Minimization scope and safeguards
5. Opt-out path and Art. 18 §2 objection handling
6. Decision owner and review cadence
7. Outcome (approved / conditional / rejected)

Activities with `consent` or `contract` legal basis are not in scope here and
are recorded in `docs/ropa.md` under their respective rows. Marketing push,
marketing email, promotional broadcasts, and per-user engagement analytics
are explicitly **not** LI per [JDMA-628](/JDMA/issues/JDMA-628) §B and must
use consent (Art. 7, I).

The full Relatório de Impacto à Proteção de Dados (RIPD / DPIA) for high-risk
activities is tracked separately under
[JDMA-672](/JDMA/issues/JDMA-672) (T23). The LIAs below cite the RIPD where
the activity is also high-risk.

---

## LIA index

| #      | Activity                                 | LGPD basis                     | RIPD required?                          | Outcome                             |
| ------ | ---------------------------------------- | ------------------------------ | --------------------------------------- | ----------------------------------- |
| LIA-01 | Ticket QR signing and anti-fraud         | Art. 7, IX                     | No (low risk)                           | Approved                            |
| LIA-02 | Feed moderation — automated and admin    | Art. 7, IX                     | Yes ([JDMA-672](/JDMA/issues/JDMA-672)) | Approved                            |
| LIA-03 | Reports and bans (user-flagged abuse)    | Art. 7, IX                     | Yes ([JDMA-672](/JDMA/issues/JDMA-672)) | Approved                            |
| LIA-04 | Admin audit log — accountability portion | Art. 7, II + Art. 7, IX (dual) | No                                      | Approved (LI portion narrow)        |
| LIA-05 | Error tracking (Sentry)                  | Art. 7, IX                     | Yes ([JDMA-672](/JDMA/issues/JDMA-672)) | **Conditional** — see preconditions |
| LIA-06 | Push delivery diagnostics                | Art. 7, IX                     | No (operational telemetry)              | Approved                            |
| LIA-07 | Payment-flow fraud signals               | Art. 7, IX                     | Yes ([JDMA-672](/JDMA/issues/JDMA-672)) | Approved                            |

---

## LIA-01 — Ticket QR signing and anti-fraud

| Field              | Value                                                                                                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Activity ID        | `TICK-01` (per `docs/ropa.md`)                                                                                                                             |
| Purpose            | Prevent ticket forgery, replay, and resale fraud at event check-in.                                                                                        |
| Legal basis        | LGPD Art. 7, IX — legitimate interest of controller and ticketed attendees.                                                                                |
| Data categories    | `Ticket.id` (UUID), `Ticket.userId` (UUID), `Ticket.eventId`, issuance timestamp, HMAC signature. No name, no document number, no plate in the QR payload. |
| Titular categories | Registered users holding a valid ticket.                                                                                                                   |
| Recipients         | API service (verification), gate-staff admin client (verification only).                                                                                   |
| Retention          | Same as `Ticket` row (event + 5 years per CDC); HMAC keys rotated per policy.                                                                              |

**Necessity test.** The purpose is to bind a QR to a single user + event without
exposing PII at the gate. A non-signed QR would let an attacker mint tickets.
A signed QR using only opaque IDs achieves the purpose with the minimum
dataset. Consent is not appropriate because a user objecting to QR signing
would have no enforceable mechanism to enter the event, the basis is
contractual fulfillment supported by LI for the integrity check itself.

**Balancing test.**

- Controller interest: revenue protection, attendee safety (gate flow control), fairness to paying customers.
- Data-subject rights: identity confidentiality at the gate (no plaintext PII in the QR), no profiling, no resale tracking.
- Reasonable expectation: ticketed attendees expect verification at the gate. Signed QR is industry-standard.
- Net balance: controller interest is proportionate. No sensitive data (Art. 11) involved. No automated decision under Art. 20, verification result is mechanical.

**Minimization and safeguards.**

- QR payload limited to opaque identifiers and signature.
- HMAC secret stored in `FIELD_ENCRYPTION_KEY`-adjacent env var, never in source.
- Key rotation policy: at least annually and after any suspected exposure.
- No plaintext name, no CPF, no plate inside the QR.
- Verification log retains only ticket id + timestamp + outcome, not the QR image.

**Opt-out and Art. 18 §2 objection.** Objection blocks gate entry by design;
the privacy notice must explain that QR signing is intrinsic to ticket
validity. Users may request deletion of their account and tickets per Art. 18
III, handled by the LGPD data-subject request workflow (T17/T18).

**Decision owner.** CEO (temporary DPO ownership). Reviewed by counsel before
production launch.

**Outcome.** **Approved.** Low-risk telemetry; no RIPD required.

---

## LIA-02 — Feed moderation (automated and admin)

| Field              | Value                                                                                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Activity ID        | `SAFE-02`                                                                                                                                                                                         |
| Purpose            | Detect and remove content that violates community rules or law (hate speech, illegal sale, harassment, doxxing).                                                                                  |
| Legal basis        | LGPD Art. 7, IX — legitimate interest in user safety and platform integrity.                                                                                                                      |
| Data categories    | Post body, attached media metadata (R2 key, type, byte length, not image content beyond moderation hash), authorId (UUID), createdAt, moderator decision, reason code, retention of decision log. |
| Titular categories | All users posting to feed; reporting users; targets of moderation actions.                                                                                                                        |
| Recipients         | Internal: admin moderators, security on-call. External: none.                                                                                                                                     |
| Retention          | Removed-post records retained 24 months for appeal and repeat-offender pattern detection.                                                                                                         |

**Necessity test.** A platform allowing user-generated content cannot rely
purely on consent for moderation because the people most harmed are often
not the posters. Contract basis covers terms-of-service enforcement but
moderation evidence retention beyond an active ban requires LI. The narrowest
dataset that supports moderation is the post body, author, timestamp, and
decision. We do not retain biometric inference, sentiment scoring, or
political profiling.

**Balancing test.**

- Controller interest: user-safety duty, ANPD-aligned reasonable-expectation framework, third-party victim protection.
- Data-subject rights: free expression, contestability of moderation decisions, no over-broad surveillance.
- Reasonable expectation: posters acknowledge ToS that authorizes moderation; victims and law-enforcement-adjacent processing falls under Art. 7, IX precedent for user-safety platforms.
- Net balance: proportionate. Out-of-scope items (mass keyword tracking, political view profiling) are explicitly excluded.

**Minimization and safeguards.**

- Moderation log entries include decision reason from a fixed taxonomy.
- No background scraping of user metadata for behavioural scoring under this basis.
- Sensitive data (Art. 11) is never deliberately collected; if a moderated post contains sensitive content, it is treated as evidence and segregated.
- Access to the moderation log is restricted via RBAC (`admin:moderation`).

**Opt-out and Art. 18 §2 objection.** Users may object to moderation
decisions via the admin appeal flow; objection to the existence of
moderation itself is rejected because it would defeat the user-safety
purpose (LGPD Art. 10 §1, LI grounded in third-party rights). Privacy notice
documents the appeal path.

**RIPD reference.** Required, see [JDMA-672](/JDMA/issues/JDMA-672)
section on `UGC + moderation`.

**Decision owner.** CEO (temporary). Counsel + CTO co-sign.

**Outcome.** **Approved**, contingent on the RIPD landing before public
launch.

---

## LIA-03 — Reports and bans (user-flagged abuse)

| Field              | Value                                                                                                                                                                         |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Activity ID        | `SAFE-03`                                                                                                                                                                     |
| Purpose            | Allow users to flag abusive content or behaviour and let admins act on those reports, including temporary or permanent bans.                                                  |
| Legal basis        | LGPD Art. 7, IX — legitimate interest in user safety, third-party protection.                                                                                                 |
| Data categories    | Reporter userId, reporter timestamp, target userId or content id, free-text reason (sensitive-data discouraged in UI copy), admin decision, decision rationale, ban duration. |
| Titular categories | Reporting users, reported users / authors of reported content.                                                                                                                |
| Recipients         | Internal admin moderators only.                                                                                                                                               |
| Retention          | Reporter identity retained for the lifetime of the report record (5 years) for audit and abuse-of-report detection.                                                           |

**Necessity test.** Anonymous reports are useful but materially less reliable
than identified reports for repeat-offender detection. Retention of reporter
identity is necessary to deter weaponized reporting and to support
contestability of bans. We considered hashing reporter id; rejected because
admins must be able to contact reporters in escalations.

**Balancing test.**

- Controller interest: keep platform safe; provide due process to banned users.
- Reporter rights: confidentiality from the reported user (admins only); protection from retaliation.
- Reported user rights: contestability, proportionality, no shadow-ban.
- Reasonable expectation: users posting content accept that other users may flag it; reporters accept admin visibility.
- Net balance: proportionate. Reporter identity is **never** disclosed to the reported user.

**Minimization and safeguards.**

- UI copy nudges reporters away from including sensitive-data Art. 11 in the reason field.
- Free-text reason is sanitized and stored without indexing by sensitive attributes.
- Ban decisions logged with reviewer id, reason code, evidence ref.
- Sentry breadcrumbs strip the reason payload (see T01).

**Opt-out and Art. 18 §2 objection.** Reported users may appeal a ban or
request review. Reporters may withdraw a report; the withdrawn report is
retained for fraud-of-report audit but flagged as withdrawn.

**RIPD reference.** Required, see [JDMA-672](/JDMA/issues/JDMA-672)
section on `Reports/bans`.

**Decision owner.** CEO (temporary). Counsel co-sign.

**Outcome.** **Approved**, contingent on the RIPD.

---

## LIA-04 — Admin audit log (LI portion above legal-obligation floor)

| Field              | Value                                                                                                                                                                                                                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Activity ID        | `GOV-01`                                                                                                                                                                                                                                                                                |
| Purpose            | Maintain a full audit log of admin actions (status changes, refunds, bans, role changes, exports, deletions) for accountability and ANPD investigation support.                                                                                                                         |
| Legal basis        | **Dual.** Art. 7, II, legal obligation (LGPD Art. 6, X and Art. 37 record-keeping duty) for the minimum compliance floor. Art. 7, IX, legitimate interest for the additional accountability fields beyond that floor (e.g., evidence captures, internal review notes, screenshot refs). |
| Data categories    | Actor admin id, target user/order/event id, action verb, before/after diff snippets, timestamp, IP, user-agent.                                                                                                                                                                         |
| Titular categories | Admin users (as actors), data subjects whose records are touched.                                                                                                                                                                                                                       |
| Recipients         | Internal: compliance, CTO, CEO. External: ANPD on regulatory request.                                                                                                                                                                                                                   |
| Retention          | 5 years aligned with CDC and ANPD investigation timelines.                                                                                                                                                                                                                              |

**Necessity test.** The legal-obligation floor (Art. 7, II) covers a minimal
audit. The richer dataset (diffs, internal review notes) is not strictly
required by statute but is necessary for actual accountability and for
defending the platform against ANPD inquiries or civil claims. A purely
contract basis is inappropriate because the data subjects logged are not
parties to the contract being recorded (they are the _subjects_ of admin
action).

**Balancing test.**

- Controller interest: accountability, ANPD investigation support, defense of operational decisions, fraud audit.
- Data-subject rights: admin actors have reduced expectation of privacy on actions taken in their privileged role; affected end users gain a record they can request via Art. 18 II (access).
- Net balance: proportionate. LI portion strictly additive to the legal-obligation floor; no behavioural profiling of admins beyond action logging.

**Minimization and safeguards.**

- Diffs redacted to non-sensitive fields; secret fields excluded by allowlist.
- Admin IP and UA retained for the audit log only, not used for marketing or scoring.
- RBAC: read access restricted to `admin:auditor` role; bulk export gated.
- Audit log entries are tamper-evident (append-only at the DB layer).

**Opt-out and Art. 18 §2 objection.** Admins cannot opt out of being logged
on the role, it is a condition of holding admin access (Art. 7, V, contract
with respect to their admin role). End users may exercise Art. 18 II (access)
to obtain a record of admin actions against them. Objection under Art. 18 §2
is rejected on third-party-protection grounds (Art. 10 §1) where the log is
needed to defend other users.

**RIPD reference.** Not required (low risk, accountability-only).

**Decision owner.** CEO (temporary). CTO co-sign for the technical retention model.

**Outcome.** **Approved**, LI portion narrowly framed.

---

## LIA-05 — Error tracking (Sentry)

| Field              | Value                                                                                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Activity ID        | `OBS-01`                                                                                                                                                                                               |
| Purpose            | Detect, diagnose, and fix production errors and runtime failures across `api`, `admin`, and `mobile`.                                                                                                  |
| Legal basis        | LGPD Art. 7, IX, legitimate interest in operational integrity.                                                                                                                                         |
| Data categories    | Exception type, stack trace, route, request id, user id (pseudonymized), breadcrumbs after `beforeSend` PII scrubbing. **No** plaintext email, CPF, plate, payment ids, message bodies, free-text PII. |
| Titular categories | Users encountering errors; admin staff using the admin client.                                                                                                                                         |
| Recipients         | Internal engineering on-call. External: Sentry (US, international transfer, see DPA + SCC).                                                                                                            |
| Retention          | 90 days hot, then anonymized aggregate metrics.                                                                                                                                                        |

**Necessity test.** Operational error telemetry is necessary to detect
incidents that risk user data (LGPD Art. 46 security duty). Disabling Sentry
entirely would harm user safety by slowing breach detection. Consent is not
suitable because errors occur on unauthenticated paths (signup, OAuth
callback) where a consent record may not exist before the failure.

**Balancing test.**

- Controller interest: regulator-grade incident response, Art. 46 security duty, ANPD breach-notification (Art. 48) readiness.
- Data-subject rights: protection from over-broad telemetry, no marketing reuse, no third-party sale.
- Reasonable expectation: users tolerate error telemetry only if it is minimized and never contains plaintext PII.
- Net balance: proportionate **only with** PII scrubbing in place.

**Preconditions for LI defensibility.** This LIA is **not effective** until:

1. `beforeSend` PII scrubbing is live on all three apps (T01).
2. Sentry session replay on `admin` is gated by an explicit cookie-consent banner (T12).
3. Sentry DPA includes ANPD SCC (vendor governance, T19/T28).

Until all three conditions hold, incident review must run with **redacted
breadcrumbs only**, and the Sentry LI claim is treated as **non-compliant**.

**Minimization and safeguards.**

- Allowlist for breadcrumb categories.
- Scrub list for `email`, `cpf`, `plate`, `Authorization` headers, payment refs.
- No replay on `mobile` or `api`.
- Sentry user-context limited to `userId` UUID.

**Opt-out and Art. 18 §2 objection.** Authenticated users may request that
their `userId` not be attached to Sentry events; the platform replaces it
with a per-session ephemeral id. Anonymous error reports are minimization-by-default.

**RIPD reference.** Required, see [JDMA-672](/JDMA/issues/JDMA-672)
section on `Sentry PII handling`.

**Decision owner.** CEO (temporary). CTO co-sign on the engineering controls.

**Outcome.** **Conditional / not effective** until T01, T12, and vendor SCC
land. Until then the LI basis is **not defensible** and full-breadcrumb
incident review must be paused.

---

## LIA-06 — Push delivery diagnostics

| Field              | Value                                                                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Activity ID        | `MSG-03`                                                                                                                                     |
| Purpose            | Diagnose push-notification delivery failures (invalid tokens, vendor errors, retry routing) to keep transactional push reliable.             |
| Legal basis        | LGPD Art. 7, IX, legitimate interest in service reliability.                                                                                 |
| Data categories    | Push token reference (opaque), provider response code, timestamp, retry count. **No** message body retained beyond 30 days under this basis. |
| Titular categories | Users who have registered a push token.                                                                                                      |
| Recipients         | Internal engineering. External: Expo Push (US, vendor DPA).                                                                                  |
| Retention          | 30 days for delivery telemetry; aggregate counters retained longer.                                                                          |

**Necessity test.** Push delivery is integral to transactional flows
(ticket-confirmation, gate-change notifications). Without delivery
diagnostics, the platform cannot detect token expiry, vendor outages, or
silent drops that put attendees at risk of missing event-critical
communication. Consent is not suitable because the diagnostics underpin
transactional push (which is already on contract basis).

**Balancing test.**

- Controller interest: reliable transactional delivery, Art. 46 quality duty.
- Data-subject rights: no per-user engagement profiling, no marketing reuse.
- Reasonable expectation: users expect their notifications to arrive; minimal telemetry to that end is expected.
- Net balance: proportionate.

**Minimization and safeguards.**

- Message body **not retained** beyond 30 days under this basis.
- No per-user engagement profile (open/click), engagement analytics on push fall under consent (see [JDMA-628](/JDMA/issues/JDMA-628) §B).
- Provider response stored as code + descriptor, not full payload.

**Opt-out and Art. 18 §2 objection.** Users may revoke push permissions in
device settings; the platform retains no diagnostics after revocation.
Objection under Art. 18 §2 is honored by switching transactional
communication to email-only (already on contract basis).

**RIPD reference.** Not required.

**Decision owner.** CEO (temporary). CTO co-sign on engineering scope.

**Outcome.** **Approved.**

---

## LIA-07 — Payment-flow fraud signals

| Field              | Value                                                                                                                                          |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Activity ID        | `PAY-03`                                                                                                                                       |
| Purpose            | Detect and block fraudulent ticket purchases (Stripe risk signals, AbacatePay anti-abuse, rate limiting on `/auth/*` and `/orders/*`).         |
| Legal basis        | LGPD Art. 7, IX, legitimate interest in fraud prevention; supported by Art. 11 §2 II if any sensitive proxy data ever appears (it should not). |
| Data categories    | Order id, user id, IP, user-agent, attempt counter, Stripe risk score, AbacatePay risk score, decision outcome.                                |
| Titular categories | Purchasers and would-be purchasers.                                                                                                            |
| Recipients         | Internal payments + security on-call. External: Stripe, AbacatePay (per their DPAs).                                                           |
| Retention          | 24 months aligned with chargeback and dispute windows.                                                                                         |

**Necessity test.** Fraud signals cannot be reduced to a contract basis
because they apply _before_ a contract exists (rate-limiting `/auth/*` on
unauthenticated traffic). Consent is impossible, an attacker would never
consent to anti-fraud processing of their own attempts. LI is the only
viable basis. Minimum dataset is the request metadata plus the provider
risk score.

**Balancing test.**

- Controller interest: chargeback exposure, revenue protection, attendee trust.
- Data-subject rights: avoidance of false-positive blocks, no automated denial under Art. 20 without recourse.
- Reasonable expectation: payment fraud screening is universally expected.
- Net balance: proportionate, **with** human review on high-stakes denials.

**Minimization and safeguards.**

- **No automated denial of service without human review when the stakes are high** (e.g., banning a verified member). High-stakes denials route to a human admin queue.
- No reuse of fraud signals for marketing or for user-trust scoring outside the payment path.
- IP retained for 24 months; not exposed to non-security roles.
- Stripe / AbacatePay risk scores stored opaque; we do not attempt to reverse-engineer them.

**Opt-out and Art. 18 §2 objection.** Objection to fraud screening is
rejected on third-party-protection grounds (Art. 10 §1). Users denied a
purchase may request human review via the support flow, explicit Art. 20
recourse path.

**RIPD reference.** Required, see [JDMA-672](/JDMA/issues/JDMA-672)
section on `Payments + payments-fraud`.

**Decision owner.** CEO (temporary). CTO co-sign on the engineering rule
catalog. Counsel co-sign on the Art. 20 recourse wording.

**Outcome.** **Approved.**

---

## Mandatory conditions for every LI claim above

These conditions are restated from [JDMA-628](/JDMA/issues/JDMA-628) §C and
apply to **all** LIAs in this pack:

1. **LIA on file** before production launch in Brazil; refreshed annually or on material change.
2. **Minimization**, the narrowest dataset that achieves the purpose; out-of-scope data is cut, not retroactively justified.
3. **Opt-out path published** in the privacy notice for every LI-backed activity, including Art. 18 §2 objection handling.
4. **No sensitive data** (Art. 11) handled under LI. Sensitive disclosures in `bio`, `SupportTicket.message`, and `Report.reason` must be discouraged at the UI and stripped from Sentry breadcrumbs (T01).
5. **High-risk activities go to RIPD** ([JDMA-672](/JDMA/issues/JDMA-672)).
6. **Sentry-specific gate**, LIA-05 is **conditional** on T01 (beforeSend) and T12 (consent gate) shipping.

---

## Document hygiene

- This document is the canonical artifact for T36 ([JDMA-661](/JDMA/issues/JDMA-661)).
- Cross-referenced by `docs/ropa.md` (per-activity rows) and the upcoming
  RIPD in [JDMA-672](/JDMA/issues/JDMA-672).
- Annual review owner: **DPO** once appointed under
  [JDMA-641](/JDMA/issues/JDMA-641); CEO until then.
- Change record: append-only below.

### Change history

| Date       | Author | Change                                                                                                                                                         |
| ---------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-15 | CEO    | Initial v1 draft. 7 LIAs covering activities flagged "LI approved" in [JDMA-628](/JDMA/issues/JDMA-628). LIA-05 (Sentry) marked conditional pending T01 + T12. |
