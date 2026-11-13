# CLAUDE.md

Guidance for Claude working in this repository. Also read `AGENTS.md` (Expo's own rules: use `npx expo install`, check versioned Expo docs, Expo Router, EAS).

## What this is

LFL Steward Companion: a React Native + Expo (TypeScript) app for Little Free Library stewards. Planning docs: `docs/features-and-data-model.md` (features, data model, sync, hosting), `docs/architecture.md` (scope and subsystems), `docs/backend-requirements.md` (contract with the backend). Locked UI notes are in `design/design.md`, a local-only folder that may be missing in a fresh clone; the essentials are below. Do not re-decide what these settle.

## Architecture rules

- This repo is the **client only**. The backend/infrastructure is a separate project. Anything we need from it goes in `docs/backend-requirements.md`; anything it asks of us goes in that file's "Requirements from the backend" section. Keep both current.
- Subsystems must stay replaceable: `src/sync` (local store, row sync, media upload), `src/membership` (sign-in, roles, member status, permissions, device trust), `src/server` (the only path to the backend: base URL, API version, credentials, request signing, error codes) and `src/location` (position plus problem handling). Each has a contract in `types.ts` and a public `index.ts`. Vendor code (Supabase, S3, SQLite) goes only in `src/<subsystem>/adapters/<vendor>/`. Screens import only from a subsystem's `index.ts`.
- `design/` is gitignored on purpose; don't add it to the repo.

## Key decisions

- Location: the check-in never blocks on location; visits may have no position. New libraries need a position from GPS or a pin placed on a map. Handle permission denied, location off, no fix, low accuracy, stale and mocked positions (`src/location/index.ts`).
- Addresses: the **steward** enters or confirms every street address; nothing else may set it. Server-suggested addresses are a **nice-to-have** behind `FEATURES.addressSuggestions`: the app must work fully with the switch off, so no code path may depend on suggestions. A library can be saved with `addressStatus: 'missing'` and the app reminds the steward.
- Accounts are created on the backend's web sign-up form, never in the app; the app only signs in (with a link to the form).
- Devices (`docs/device-trust.md`, decided): hardware-backed key + App Attest / Play Integrity; trusted as soon as attestation passes, pending if it fails; no device limit; no shared phones; trust expires after 30 days and the app renews it quietly before then; requests are signed; devices can be removed. Every record carries `createdOnDeviceId`.
- Membership curates contributors: members are `pending` until an admin approves them, then `active`; admins can `suspend`. Only active members can submit.
- Users are stewards and admins. Everyone signed in can see every library. You can edit what you created; admins can edit anything (`canEdit` in `src/types/models.ts`).
- Data: Library → Visit → Attachment (photo or audio) and Comment. Photo roles: shelf, establishing, location (at most one per role per visit). Condition fields live on Visit.
- Offline first: local SQLite is the source the UI reads; device-generated UUIDs; rows and files sync in separate queues.
- Backend: self-hosted Supabase on the owner's servers; media in Amazon S3 via signed upload URLs. No hosted/monthly services without asking.
- Voice notes are capped at 90 seconds (`src/config/limits.ts`).
- Check-in is a 4-step wizard: Photos → Condition (optional) → Notes (optional) → Review and finish.
- Look: "Neighborly" (Nunito, terracotta `#A8482A` on `#FBF6F1`, rounded). Themes (light, dark, high contrast) are required later, so keep colors in a theme object rather than hard-coded.

## Layout

- `App.tsx`, `index.ts`: Expo entry (blank template; move to Expo Router `src/app/` when screens are added).
- `src/types/models.ts`: data model types.
- `src/config/limits.ts`: product limits.
- `src/sync/`: sync subsystem (contract only so far; adapters not built).
- `src/membership/`: membership subsystem (contract, permission rules, device trust contracts in `devices.ts`; adapters not built).
- `src/server/`: server subsystem (contract only).
- `src/location/`: location subsystem (contract and problem handling; adapter not built).
- `docs/`: planning docs. `design/`: local-only design notes.

## Commands

```bash
npm install
npx expo start
npx tsc --noEmit   # typecheck
npx expo lint      # lint
```

Run typecheck and lint before calling a task done.
