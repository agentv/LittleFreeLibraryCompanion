# LFL Steward Companion: mobile app

The iOS and Android app, built with React Native + Expo (TypeScript). It is offline first: local SQLite is what the UI reads, and rows and media sync to the backend later.

The app talks to the backend only through `src/server` and only as described in [../docs/backend-requirements.md](../docs/backend-requirements.md). Its subsystems (`src/sync`, `src/membership`, `src/server`, `src/location`) are described in [../docs/architecture.md](../docs/architecture.md). Expo-specific rules are in [AGENTS.md](AGENTS.md).

## Try it

```bash
cd mobile
npm install
npx expo start
```

Open it in **Expo Go** on your phone (scan the QR code). Everything in this build runs in Expo Go.

With no settings, the app starts in **demo mode**: sample libraries appear around wherever you are, any email signs in with the code `123456`, and nothing leaves the phone. Demo data is kept in its own database, separate from real data.

To use a real backend, create `mobile/.env.local` (gitignored):

```bash
EXPO_PUBLIC_API_URL=https://api.example.org   # the server's origin, without /v1
# EXPO_PUBLIC_DEMO_MODE=1                     # force demo mode even with a URL
```

Then restart `npx expo start`. Sign-up happens on `<API_URL>/signup` in a browser; the app only signs in.

## What's in `src/`

| Path | What it does |
|---|---|
| `app/` | Screens (Expo Router): home, sign-in, libraries (list, card, add/edit with a map pin), the check-in wizard, history, a visit, profile, devices, admin. |
| `features/` | Check-in draft and records, photo/audio capture helpers, plain-language summaries, shared store queries, the wizard steps. |
| `services/` | Picks the adapters at startup (real backend or demo), runs sync automatically, and gives screens React hooks. |
| `sync/` | Local store (in memory, written through to SQLite), the sync engine (rows, then files, then pull), adapters for the Node service, S3 uploads and demo mode. |
| `membership/` | Sign-in, permissions, the device key, registration and quiet 30-day renewal, admin actions. |
| `server/` | The fetch client: base URL, `/v1`, access token, request signing, error codes. |
| `location/` | expo-location with every problem handled, and distance helpers. |
| `theme/`, `ui/` | The Neighborly theme object and small UI parts (no colors hard-coded in screens). |

## How it behaves

- **Check-in** is the locked 4-step wizard: Photos (Shelf, Establishing, Location, each skippable, then extras) → Condition (optional) → Notes (voice note up to 90 s with a countdown, comment with photos) → Review and finish. It never waits for location; the visit saves without a position if there isn't one.
- **Saving** writes to the phone first. Photos are resized to 1600 px with a 320 px thumbnail and copied into the app's own storage straight away. Sync pushes rows (libraries, then visits, comments, attachments), uploads files straight to S3 once the server has the visit, pushes the storage paths, then pulls. It runs on start, every minute, when the app comes back to the front, and when the network returns, with backoff after errors.
- **Held and flagged rows:** pushes from a phone that isn't trusted yet are held by the server for an admin; the app marks them "waiting for an admin to review" and doesn't resend them. A changed address that conflicts with the confirmed one is flagged; the app says so on the library card.
- **Device key (first build, decided 2026-11-14):** a P-256 key kept in the phone's secure storage and used in app code, so it runs in Expo Go. Every request is signed as the backend expects (`test/p256.test.ts` checks it against Node's own crypto). A Secure Enclave / StrongBox key and App Attest / Play Integrity replace it later behind `DeviceKeyStore` and `DeviceAttestation`; until then every new phone registers as pending and an admin approves it in the app.
- **Admins** get an Admin screen: approve or suspend members, change roles, approve or remove phones, and accept or reject held changes and address conflicts.

## Checks

```bash
npm run typecheck   # tsc for the app and the tests
npx expo lint
npm test            # sync engine, check-in records and request signing, in Node
```

Add packages with `npx expo install <package>` so versions match the Expo SDK.
