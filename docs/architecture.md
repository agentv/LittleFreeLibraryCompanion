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
| **membership** | `src/membership/` | Sign-in, who someone is, their role and status, what they may do | Supabase Auth + a members table |

Rules:

1. Screens and features import only from a subsystem's `index.ts`, never from inside its `adapters/` folder.
2. Each subsystem defines its contract in `types.ts`. Vendor code (Supabase, S3, etc.) lives only in `adapters/<vendor>/` and implements that contract.
3. The app picks adapters in one place at startup, so swapping a backend is a one-line change plus a new adapter.
4. Subsystems don't import each other's internals. Sync asks membership for the current session through membership's public interface.
5. Shared data shapes live in `src/types/models.ts`.

```
screens / features
      │  (public interfaces only)
      ├── src/sync         ── adapters/supabase, adapters/s3, adapters/sqlite
      └── src/membership   ── adapters/supabase
```

## Design work

Design exploration lives in a top-level `design/` folder that is **kept out of the remote repository** (it's in `.gitignore`). Locked design decisions that code depends on are summarized in `CLAUDE.md`. The design folder is also copied to the project's shared files so it isn't lost.
