# CLAUDE.md

Guidance for Claude working in this repository. For work in `mobile/`, also read `mobile/AGENTS.md` (Expo's own rules: use `npx expo install`, check versioned Expo docs, Expo Router, EAS).

## What this is

LFL Steward Companion: a React Native + Expo (TypeScript) app for Little Free Library stewards, plus the Node.js + TypeScript backend that serves it. Planning docs: `docs/features-and-data-model.md` (features, data model, sync, hosting), `docs/architecture.md` (scope and subsystems), `docs/backend-requirements.md` (contract with the backend). Locked UI notes are in `design/design.md`, a local-only folder that may be missing in a fresh clone; the essentials are below. Do not re-decide what these settle.

## Two products, developed separately

- `mobile/` is the app; `server/` is the backend service and its infrastructure. Each has its own `package.json`, lockfile, `tsconfig.json`, build, checks and README. There is no root `package.json`: run commands from inside the folder you are working on.
- Neither side imports from the other's folder. They meet only at `docs/backend-requirements.md`: what the app needs goes in the main list; what the server asks of the app goes in its "Requirements from the backend" section. A change that alters the contract updates that file in the same change.
- Keep a change to one side self-contained. If shared types are ever worth it, propose a small shared package both depend on rather than a cross-folder import.
- `docs/` is shared by both sides. `design/` (gitignored, local only) stays at the root.

## Architecture rules (mobile)

Paths in this section are inside `mobile/`.

- Subsystems must stay replaceable: `src/sync` (local store, row sync, media upload), `src/membership` (sign-in, roles, member status, permissions, device trust), `src/server` (the only path to the backend: base URL, API version, credentials, request signing, error codes) and `src/location` (position plus problem handling). Each has a contract in `types.ts` and a public `index.ts`. Vendor code (Supabase, S3, SQLite) goes only in `src/<subsystem>/adapters/<vendor>/`. Screens import only from a subsystem's `index.ts`.
- `design/` is gitignored on purpose; don't add it to the repo.

## Key decisions

Code paths below are inside `mobile/` unless they say otherwise.

- Location: the check-in never blocks on location; visits may have no position. New libraries need a position from GPS or a pin placed on a map. Handle permission denied, location off, no fix, low accuracy, stale and mocked positions (`src/location/index.ts`).
- Addresses: the **steward** enters or confirms every street address; nothing else may set it. Server-suggested addresses are a **nice-to-have** behind `FEATURES.addressSuggestions`: the app must work fully with the switch off, so no code path may depend on suggestions. A library can be saved with `addressStatus: 'missing'` and the app reminds the steward.
- Accounts are created on the backend's web sign-up form, never in the app; the app only signs in (with a link to the form).
- Devices (`docs/device-trust.md`, decided): hardware-backed key + App Attest / Play Integrity (first build, decided 2026-11-14: a P-256 key in the phone's secure storage, signing in app code, so it runs in Expo Go; swap behind `DeviceKeyStore` when attestation lands); trusted as soon as attestation passes, pending if it fails; no device limit; no shared phones; trust expires after 30 days and the app renews it quietly before then; requests are signed; devices can be removed. Every record carries `createdOnDeviceId`.
- Membership curates contributors: members are `pending` until an admin approves them, then `active`; admins can `suspend`. Only active members can submit.
- Users are stewards and admins. Everyone signed in can see every library. You can edit what you created; admins can edit anything (`canEdit` in `src/types/models.ts`).
- Data: Library → Visit → Attachment (photo or audio) and Comment. Photo roles: shelf, establishing, location (at most one per role per visit). Condition fields live on Visit.
- Offline first: local SQLite is the source the UI reads; device-generated UUIDs; rows and files sync in separate queues.
- Backend (`server/`): the app talks **only** to the Node.js + TypeScript service (Hono) under `/v1`; behind it are self-hosted Postgres and Supabase Auth on the owner's servers (no Supabase REST, Storage or gateway). Media in Amazon S3 via signed upload URLs. No hosted/monthly services without asking.
- Address conflicts: a steward's address that contradicts the confirmed one on record is flagged for an admin, and the original stays. The server never decides an address during sync.
- Pushes from devices that aren't trusted (pending, failed attestation, expired, removed) are held for an admin, never applied or dropped.
- Voice notes are capped at 90 seconds (`src/config/limits.ts`).
- Check-in is a 4-step wizard: Photos → Condition (optional) → Notes (optional) → Review and finish.
- Look: "Neighborly" (Nunito, terracotta `#A8482A` on `#FBF6F1`, rounded). Themes (light, dark, high contrast) are required later, so keep colors in a theme object rather than hard-coded.

## Layout

- `mobile/`: the Expo app.
  - `src/app/`: screens (Expo Router; entry is `expo-router/entry`).
  - `src/services/`: the one place adapters are chosen (real backend or demo mode), auto-sync, React hooks.
  - `src/features/`: check-in draft and records, capture helpers, summaries, wizard steps.
  - `src/theme/`, `src/ui/`: theme object and UI parts.
  - `src/types/models.ts`: data model types.
  - `src/config/`: product limits (`limits.ts`), sync timing, per-build env (`env.ts`).
  - `src/sync/`: sync subsystem (in-memory store over SQLite, engine, Node service / S3 / demo adapters).
  - `src/membership/`: membership subsystem (sign-in, permissions, device key and trust, admin directory; Node service, secure-store and demo adapters).
  - `src/server/`: the app's client for the backend (fetch adapter, request signing). Not to be confused with the top-level `server/`.
  - `src/location/`: location subsystem (expo-location adapter, problem handling, distance).
  - `test/`: Node tests (`npm test`).
- `server/`: the backend. `migrations/` (SQL schema, row-level security, history triggers), `src/` (Hono service: `http/context.ts` request pipeline, `auth`, `devices`, `sync`, `media`, `admin`, `signup`), `test/` (integration tests against a real Postgres), `docker/` (compose stack), `scripts/` (backups). See `server/README.md`.
- `docs/`: planning docs shared by both. `design/`: local-only design notes.

## Commands

Mobile (from `mobile/`):

```bash
npm install
npx expo start
npm run typecheck  # app and tests
npx expo lint      # lint
npm test           # Node tests
```

With no `EXPO_PUBLIC_API_URL` the app runs in demo mode (code 123456).

Server (from `server/`):

```bash
npm install
npm run build
npm run typecheck
TEST_DATABASE_ADMIN_URL=postgres://postgres@localhost:5432/postgres npm test
```

Run the checks for each side you changed before calling a task done.
