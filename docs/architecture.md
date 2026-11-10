# Architecture

Decided 2026-11-09.

## Scope of this repository

This repository is the **client only**: the iOS and Android app. The backend and infrastructure (self-hosted Supabase, S3 buckets, auth email, backups) are a **separate project**.

The two projects meet at a contract:

- [backend-requirements.md](backend-requirements.md) lists what this app needs from the backend.
- Its "Requirements from the backend" section records what the backend project asks of us in return. Both sides keep it current as they evolve.

## Modular subsystems

Every piece that depends on a vendor or service lives behind an interface so it can be replaced as we scale, without touching screens.

| Subsystem | Folder | Job | First implementation |
|---|---|---|---|
| **sync** | `src/sync/` | Local database, outbound/inbound row sync, media upload queue | SQLite on device + self-hosted Supabase + S3 signed uploads |
| **membership** | `src/membership/` | Sign-in, who someone is, their role and status, what they may do, and device verification ([device-trust.md](device-trust.md)) | Supabase Auth + members and devices tables; secure hardware keys; App Attest / Play Integrity |
| **server** | `src/server/` | The one way the app talks to the backend: base address, API version, credentials, request signing, error codes | fetch-based client for the self-hosted backend |
| **location** | `src/location/` | Getting a position and handling problems (permission denied, location off, no fix, low accuracy, stale, mocked) with a place-on-map fallback | expo-location |

Rules:

1. Screens and features import only from a subsystem's `index.ts`, never from inside its `adapters/` folder.
2. Each subsystem defines its contract in `types.ts`. Vendor code (Supabase, S3, etc.) lives only in `adapters/<vendor>/` and implements that contract.
3. The app picks adapters in one place at startup, so swapping a backend is a one-line change plus a new adapter.
4. Subsystems don't import each other's internals. Sync and membership adapters send requests through `src/server`; the server subsystem gets tokens and request signatures from membership through the `CredentialsProvider` interface.
5. Shared data shapes live in `src/types/models.ts`.
6. The phone never turns coordinates into an address. It sends coordinates and the server fills the address in during sync.

```
screens / features
      │  (public interfaces only)
      ├── src/sync         ── adapters/sqlite, adapters/s3 ─┐
      ├── src/membership   ── adapters/supabase, secure keys,├─▶ src/server ── adapters/fetch ─▶ backend
      │                       attestation                    │
      └── src/location     ── adapters/expo-location
```

## Design work

Design exploration lives in a top-level `design/` folder that is **kept out of the remote repository** (it's in `.gitignore`). Locked design decisions that code depends on are summarized in `CLAUDE.md`. The design folder is also copied to the project's shared files so it isn't lost.
