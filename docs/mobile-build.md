# Mobile build runbook (iOS preview, EAS cloud)

Goal: produce one installable iOS preview build of `@jdm/mobile`, install it on a physical iPhone, run the smoke-test checklist.

Profile: `preview` from `apps/mobile/eas.json` — internal distribution, non-simulator IPA, channel `preview`. Build env already pins:

- `APP_VARIANT=preview` → bundle id `com.jdmexperience.app.preview`, app name "JDM Experience (Preview)"
- `EXPO_PUBLIC_API_BASE_URL=https://jdm-production.up.railway.app`

Stripe publishable key and Sentry DSN are not required for first install. Stripe screens will fail gracefully; Sentry no-ops if DSN empty.

## Prerequisites (one-time)

- Apple Developer Program membership ($99/yr) on the same Apple ID you sign into Xcode with.
- Expo account (free).
- iPhone running iOS 16+, paired with the same Apple ID or registered as a test device.
- Mac with Xcode Command Line Tools installed (`xcode-select --install`).
- Repo at this commit or later, `pnpm install` already run.

## Step-by-step

All commands run from the repo root unless noted.

### 1. Authenticate `eas-cli`

```bash
pnpm dlx eas-cli@latest login
```

Use your Expo username/password. Confirm with `pnpm --filter @jdm/mobile exec eas whoami`.

### 2. Initialise the EAS project

```bash
pnpm --filter @jdm/mobile exec eas init --non-interactive
```

This creates an EAS project on the Expo dashboard and prints a `EAS_PROJECT_ID` UUID. Copy it into `apps/mobile/.env`:

```
EAS_PROJECT_ID=<uuid-from-eas-init>
```

`apps/mobile/app.config.ts` reads it via `process.env.EAS_PROJECT_ID`.

### 3. Register your iPhone as an internal test device

```bash
pnpm --filter @jdm/mobile exec eas device:create
```

Pick "Website" → choose Apple Team → EAS prints a URL and QR code. Open the URL in **Safari on the iPhone**, install the provided profile in Settings → Profile Downloaded, accept the prompt to add the device. The UDID is now registered in your Apple Developer account and pinned in EAS.

### 4. Build

```bash
pnpm --filter @jdm/mobile exec eas build --profile preview --platform ios
```

First run will:

- Prompt to register the bundle id `com.jdmexperience.app.preview` on App Store Connect (accept).
- Prompt to generate a distribution certificate and provisioning profile (accept; let EAS manage them).
- Queue a cloud build. Typical time: 12–25 min.

Watch progress in the terminal or at the EAS dashboard URL printed.

### 5. Install on the iPhone

When the build finishes EAS prints an install URL and QR code:

- Open the URL on the iPhone in Safari, or scan the QR with the camera app.
- Tap "Install" — the app downloads as `JDM Experience (Preview)`.
- First launch: Settings → General → VPN & Device Management → trust the developer profile if iOS prompts.

App is installed and points at Railway prod (`https://jdm-production.up.railway.app`).

## Smoke-test checklist

Run on the device after install. Each step is a binary pass/fail; capture failures with screenshots and post on JDMA-122.

- [ ] App launches without crash. Splash → first screen.
- [ ] Network: any request that hits the API returns successfully (check that the welcome / events list does not show a network-error empty state).
- [ ] Auth flow: open the sign-in or magic-link screen, request a code, confirm the request reaches the API (Railway logs).
- [ ] Navigation: at least two route transitions work (expo-router).
- [ ] Status bar / dark theme renders correctly.
- [ ] Backgrounding the app and resuming does not crash or blank-screen.
- [ ] No red-box JS errors visible.
- [ ] Sentry: not required for this build (DSN unset; no events expected).
- [ ] Stripe: not required for this build; payment screens may show inline errors and that is expected.

## Troubleshooting

- **`eas init` says project already linked** — `EAS_PROJECT_ID` is already set. Re-read `apps/mobile/.env` and skip to step 3.
- **Build fails on "no devices registered"** — re-run `eas device:create` and confirm the device appears in `eas device:list`.
- **Install link opens Safari but iOS refuses install** — the device profile is missing or the build was created before the device was registered. Re-run step 4 after device registration.
- **App opens but every API call fails** — confirm Railway prod is healthy: `curl https://jdm-production.up.railway.app/health` should return `200 {"status":"ok",...}`.
- **App crashes immediately on launch** — pull device logs via `xcrun devicectl device console --device <id>` or Xcode → Window → Devices, send the crash trace on JDMA-122.

## After the build

- Post the build URL and any failures from the smoke checklist as a comment on JDMA-122.
- If the build is good, follow-up issues should cover: Sentry DSN wiring for preview, Stripe test key for preview, automated EAS build on `main` push.
