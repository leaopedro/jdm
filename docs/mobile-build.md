# Mobile build runbook

Goal: produce the first working mobile builds from the profiles already checked
into `apps/mobile/eas.json`, then install the preview build on real devices for
Phase 0.9 smoke testing.

Read [`docs/eas-credentials.md`](./eas-credentials.md) first. That file covers
Apple, Google Play, and Expo account setup. This file is the execution path once
those prerequisites exist.

## Profile map

| Profile       | Output                           | Device target                    | Main use            |
| ------------- | -------------------------------- | -------------------------------- | ------------------- |
| `development` | iOS simulator development client | local iOS simulator              | Fastest first proof |
| `preview`     | iOS internal build + Android APK | physical iPhone / Android device | Real-device smoke   |
| `production`  | Store-ready build                | App Store / Play Console         | Release only        |

Important:

- `development` is not enough for push or real-device smoke.
- `preview` is the first build that matters for v0.1 verification.
- Expo Go is not the target here. Native modules in the app require an EAS
  build.

## Prerequisites

- `pnpm install` already ran at repo root.
- `pnpm dlx eas-cli login` already succeeded.
- `apps/mobile/.env` contains a valid `EAS_PROJECT_ID`.
- For iOS preview installs, at least one iPhone was registered with
  `eas device:create`.

## Step 1: Confirm the current config

Run from the repo root:

```bash
pnpm --filter @jdm/mobile exec eas whoami
cat apps/mobile/eas.json
```

Sanity-check:

- `development` has `developmentClient: true`
- `development.ios.simulator` is `true`
- `preview.distribution` is `internal`
- `preview.android.buildType` is `apk`

## Step 2: First proof build

Run the fastest build first:

```bash
pnpm --filter @jdm/mobile exec eas build --profile development --platform ios
```

What this proves:

- Expo project linkage works
- the native iOS project compiles on EAS
- the `com.jdmexperience.app.dev` variant resolves correctly

What it does not prove:

- device install
- push registration
- Apple ad hoc provisioning
- TestFlight readiness

## Step 3: First installable iPhone build

Run the real preview build:

```bash
pnpm --filter @jdm/mobile exec eas build --profile preview --platform ios
```

On the first run, accept the EAS prompts to:

- log into the Apple team if asked
- create or reuse the `com.jdmexperience.app.preview` identifier
- generate the signing certificate and provisioning profile
- include the registered test devices in the ad hoc profile

When it finishes:

- open the EAS build page
- send the install link to the iPhone
- install from Safari
- trust the profile in iOS settings if prompted

Expected app name:

- `JDM Experience (Preview)`

Expected backend target:

- `https://jdm-production.up.railway.app`

## Step 4: First installable Android build

Run:

```bash
pnpm --filter @jdm/mobile exec eas build --profile preview --platform android
```

When it finishes:

- download the APK from the EAS artifact page
- install it directly on an Android device
- or keep the artifact URL as the proof while Play Internal is being prepared

Expected result:

- installable APK for `com.jdmexperience.app.preview`

## Step 5: Optional Play Internal handoff

If Google Play Internal is already configured, move from direct APK sharing to
store-backed Android testing:

1. Build the Android artifact intended for Play.
2. Upload it to Play Console Internal testing.
3. Add tester emails or a Google Group.
4. Share the opt-in link or Play listing URL with testers.

Use this only after the direct APK proof exists. It is a distribution upgrade,
not the first unblocker.

## Step 6: Smoke checklist on the installed preview build

Run on at least one real phone:

- [ ] App launches without a native crash.
- [ ] First screen renders without a blank state loop.
- [ ] API is reachable and no global network error appears.
- [ ] Auth entrypoint opens.
- [ ] At least two route transitions work.
- [ ] Background and foreground once without crashing.
- [ ] No red-box or native fatal error appears.

Push and payments:

- Push is meaningful only on a real device build.
- Stripe native flows also need the real device build.
- If keys are still unset, record that limitation in the issue comment instead
  of treating it as a build failure.

## Step 7: What to paste into `JDMA-116`

Capture:

- build page URL for `development` iOS
- build page URL for `preview` iOS
- build page URL for `preview` Android
- which physical devices installed successfully
- pass/fail for each smoke item
- exact blocker, if any, with the failing profile and platform

## Troubleshooting

- Build asks for Apple login during `preview`:
  expected on the first interactive iOS build.
- iPhone install fails after adding a new device:
  rebuild `preview` iOS so the new UDID is in the provisioning profile.
- Android testers need Play instead of direct APK:
  use the Play Internal path after the first APK proof.
- Build succeeds but the app points to the wrong API:
  rebuild using the checked-in `preview` profile and verify the build page
  shows the expected environment.
