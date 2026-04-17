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

## Verification

- `eas build --profile development --platform ios --local` dry-run succeeds.
- `eas build --profile preview --platform ios` produces a TestFlight-ready IPA.
- `eas build --profile preview --platform android` produces an installable APK.
