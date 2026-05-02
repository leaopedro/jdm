# EAS credentials checklist

Everything below is obtained once per environment and stored in EAS's hosted
credential store — never committed.

## One-time project linkage (run locally with TTY)

The `eas init` and `eas login` steps **were intentionally skipped** during the
automated Task 9 implementation because they require an interactive TTY and an
authenticated Expo account. A developer with TTY access must run these once
before any EAS build will succeed:

```bash
pnpm dlx eas-cli login
pnpm --filter @jdm/mobile exec eas init --non-interactive
```

The `init` command populates `extra.eas.projectId` in `app.config.ts` (or
prompts for a UUID). If you want to keep the project id out of source, move
it to `apps/mobile/.env` as `EAS_PROJECT_ID=<uuid>` — `app.config.ts`
already reads from that variable.

## Apple (iOS)

- Apple Developer Program membership ($99/yr).
- App Store Connect app records for each bundle identifier:
  - `com.jdmexperience.app.dev` (development)
  - `com.jdmexperience.app.preview` (TestFlight internal)
  - `com.jdmexperience.app` (production)
- Distribution certificate + provisioning profile per bundle id (EAS can
  generate and host these; run `eas credentials` once per profile).
- App Store Connect API key (`.p8`, Key ID, Issuer ID) for `eas submit`.
- `APPLE_ID` + `ASC_APP_ID` set as EAS secrets for the `production` submit
  profile.

## Google (Android)

- Google Play Console account + app record for `com.jdmexperience.app`.
- Play Console service account JSON with "Release manager" role, uploaded
  via `eas credentials` (never commit the JSON).
- Upload keystore generated and stored in EAS.

## Expo

- `EAS_PROJECT_ID` populated in EAS dashboard, mirrored to `apps/mobile/.env`
  and GitHub Actions secrets.

## Pre-build checklist (run once per environment, in order)

1. Apple Developer Program membership active for the team that owns `com.jdmexperience.app*`.
2. Google Play Console developer account active and linked to the same organization.
3. App Store Connect records exist for the three bundle ids
   (`.dev`, `.preview`, root). At least an empty record per id; full metadata is for X.3.
4. Play Console app record for `com.jdmexperience.app` (production only — dev/preview
   distribute via Internal App Sharing or APK direct).
5. Expo account exists; `pnpm dlx eas-cli login` once on a TTY.
6. `pnpm --filter @jdm/mobile exec eas init --non-interactive` once; copy the resulting
   project UUID into `apps/mobile/.env` (`EAS_PROJECT_ID=<uuid>`) and into the GitHub
   Actions secret store (`EAS_PROJECT_ID`, `EXPO_TOKEN`).
7. `pnpm --filter @jdm/mobile exec eas credentials` once per platform per profile to upload
   distribution cert + provisioning profile (iOS) and upload keystore + service account JSON
   (Android). Service account JSON path matches `submit.production.android.serviceAccountKeyPath`
   in `eas.json`.
8. Set EAS Secrets: `APPLE_ID`, `ASC_APP_ID`. (App Store Connect API key is uploaded via
   `eas credentials`, not as a plain secret.)

## Verification

- `pnpm --filter @jdm/mobile exec eas build --profile development --platform ios --local` succeeds
  (requires Xcode + signing identity; produces a simulator-runnable build).
- `pnpm --filter @jdm/mobile exec eas build --profile preview --platform ios` produces a
  TestFlight-ready IPA on EAS hosted infra.
- `pnpm --filter @jdm/mobile exec eas build --profile preview --platform android` produces an
  installable APK on EAS hosted infra.
- `pnpm --filter @jdm/mobile exec eas build --profile production --platform all` produces
  store-ready binaries (IPA + AAB).

Each successful run prints a build page URL on `expo.dev`. Paste those URLs into [JDMA-19](/JDMA/issues/JDMA-19)
as evidence before flipping `plans/roadmap.md` § 0.9 from `[ ]` to `[x]`.
