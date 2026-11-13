# Backend requirements

The backend and infrastructure are a separate project. This document is the contract between the two: what this app needs from the backend, and (below) what the backend project needs from us. Update it whenever either side changes.

Status: draft, updated 2026-11-13 (backend language added).

## Context

- Hosting: self-hosted Supabase (Postgres, Auth, API) on the owner's own servers. No per-user or per-GB hosted-service fees; the only added cost is the server resize below.
- Media: photos and audio in the owner's Amazon S3.
- Custom server logic (attestation checks, address lookup, sync and permission rules, change history helpers) is written in **Node.js + TypeScript** (decided 2026-11-13). The app is TypeScript too, so the data shapes in `src/types/models.ts` and the request/response types can be shared, for example as a small shared package both projects use, instead of being written twice.
- Hosting (decided 2026-11-13, replaces the earlier Lambda-first plan): **one of the owner's existing low-traffic EC2 servers, resized one step** (for example t3.small → t3.medium, about $15 a month more; it has about 2.6 GB free memory and 1 GB swap today). Everything for the backend runs there:
  - a **trimmed self-hosted Supabase stack** in Docker, in its own folder with its own compose file: Postgres, Auth (sign-in), the REST API layer, Storage (signed S3 links) and the gateway in front of them. Realtime, analytics, the Studio dashboard and edge functions are left out unless a need appears.
  - the **custom Node.js + TypeScript service** (attestation checks, address lookup, sync and permission rules), written on a small portable framework (for example Hono or Fastify) so it can later move to Lambda or its own server without a rewrite.
- WordPress keeps its own MySQL/MariaDB on the same server; the two don't share a database.
- Photos and audio still go **straight from the phone to S3** with short-lived signed links (R7); they never pass through the server.
- Expected peak is small (about 15 stewards each sending 8 to 10 updates on one morning). The Node service keeps a small connection pool to Postgres; a separate pooler is only needed if the code moves to Lambda later.
- Operations on the shared server: keep swap enabled (grow it to about 2 GB after resizing), set memory limits per container so the app can't starve WordPress, **back up both WordPress and Supabase** nightly to S3 with a tested restore (R17), and **monitor memory and disk** with alerts (for example CloudWatch agent).
- The client is offline-first: it creates records on the device with its own UUIDs and syncs later. The data model is in [features-and-data-model.md](features-and-data-model.md) and `src/types/models.ts`.

## What the app needs from the backend

### 1. Data and sync (used by `src/sync`)

- R1. Tables for libraries, visits, comments, attachments and members, matching the client data model. Primary keys are client-generated UUIDs; the server must accept them as-is.
- R2. Upsert by id. Pushing the same record twice must be safe (idempotent).
- R3. Incremental pull: "give me everything changed since cursor X", including soft-deleted rows (deleted_at set), plus a new cursor.
- R4. Conflict rule: last write wins per record, using a server-assigned `updated_at`. Report rejected writes with a reason (e.g. permission denied).
- R5. Soft deletes only (deleted_at); no hard deletes from the client.
- R6. Every library and visit is readable by any signed-in active member (libraries are not private).

### 2. Media (used by `src/sync`)

- R7. Short-lived signed upload URLs for S3, issued only to active members on trusted devices, so the app uploads files straight to S3.
- R8. Short-lived signed download URLs (or a CDN path) for viewing photos and playing audio.
- R9. Limits enforced server-side too: audio at most 90 seconds; photos resized by the client to a 1600 px long edge, so reject anything unreasonably large.
- R10. Thumbnails are made on the phone (320 px long edge) and uploaded alongside each photo. The backend stores both and issues signed URLs for each; it does not need to generate thumbnails.

### 3. Membership and permissions (used by `src/membership`)

- R11. Email sign-in (magic link or one-time code). Apple/Google sign-in later.
- R11a. **Web sign-up form** run by the backend, usable in a phone browser. Accounts are created there, not in the app. New accounts start `pending`. The app links to this form; it has no sign-up screen of its own.
- R12. Roles: `steward`, `admin`.
- R13. Member status: `pending` (signed up, awaiting approval), `active`, `suspended`. Admins approve new members, so inputs to the data set are curated.
- R14. Only active members can create libraries, visits, comments or attachments. Pending and suspended members can sign in and read. New libraries do **not** need admin approval: any active steward can add one, and admins can edit or remove it afterwards.
- R15. A member can edit or delete what they created; admins can edit anything. Enforced with row-level security, not just in the app.
- R16. Admin endpoints: list members by status, approve, suspend (with reason), change role.

### 4. Operations

- R17. Nightly database backups (to S3) and a tested restore.
- R18. HTTPS on all endpoints.
- R19. An email sender for sign-in links.
- R20. A stable, versioned API so the app can keep working while the backend evolves. Breaking changes need a new version and notice in this document.
- R21. Rich change history: an append-only log of every create, update and delete on libraries, visits, comments, attachments and members. Each entry records the record and table, who made the change, when (server time and the device's time), the action, and the fields that changed with their before and after values. Entries are never edited or deleted by the app. Admins can view the history for a record. Written by the database (for example triggers), so no client can skip it.

### 5. Location and addresses

- R22. **Address lookup happens on the server during sync.** The app sends only coordinates, accuracy and location source. When a library arrives (or its coordinates change) with `address_status = pending`, the server reverse-geocodes it, fills the address fields, sets `address_status` to `resolved` (or `failed`), and returns it on the next pull.
- R23. Never overwrite an address a person typed (`address_status = manual`). If coordinates change on a manual address, keep the address and flag it for review.
- R24. Address lookup uses a **small hosted reverse-geocoding service** (decided 2026-11-13; coverage can't be limited to one region, so self-hosting is out). It sits behind a replaceable geocoder interface in the Node service, so the provider can be swapped. Every result is **saved in our database** with the library, and lookups are cached by rounded coordinates so the same spot is never paid for twice. The provider's API key stays on the server. Choose a provider whose terms allow storing results permanently (some don't), with a free or low-cost tier that covers our volume.
- R25. Location sanity checks: flag (don't reject) visits more than 150 m from their library, positions reported as mocked, and low-accuracy fixes (over 50 m), so admins can review.
- R26. Accept visits with no position. Libraries always have a position, from GPS or placed on a map (`location_source = manual_pin`).

### 6. Devices (see [device-trust.md](device-trust.md))

- R27. Device registration: issue one-time challenges; register a device with its public key, signed challenge and attestation token; link it to the member.
- R28. Verify Apple App Attest and Google Play Integrity tokens. Passed → `trusted` straight away; failed or unavailable → `pending` until an admin approves. No limit on devices per member. One member per device (no shared phones).
- R29. On every request, check the access token, that the device is trusted and belongs to the member, the request signature against the stored public key, and a timestamp within 5 minutes.
- R30. Refresh tokens are bound to the device; revoking a device stops it at its next request.
- R30a. Device trust **expires 30 days** after the last successful verification. Support re-verification (new challenge, signature and attestation) before expiry without signing in again, and after expiry with a fresh sign-in. Return `device_untrusted` with an `expired` reason so the app can renew.
- R31. Device endpoints: list my devices, revoke mine; admins list, approve and revoke any.
- R32. Stamp every record and change-history entry with the device it came from. Handle content from revoked devices per device-trust.md open question 4.

## Requirements from the backend

The backend project adds items here as it makes decisions that affect the app (for example API versions, rate limits, file-size limits, auth flow details). Each entry: date, requirement, what the app must change.

- (none yet)

## Decisions on earlier questions (2026-11-09)

- New libraries do not need admin approval (R14).
- Thumbnails are made on the phone (R10).
- Keep a rich change history (R21). Whether it is "full" (every field, forever) is still open; see Q4.

## Open questions

- Q4. How long is change history kept, and do stewards see a library's history or only admins?
- Q6. ~~Where does Postgres run?~~ Decided 2026-11-13: in the trimmed Supabase stack on the resized existing EC2 server, alongside WordPress (see Context).
- Q7. ~~Address lookup service?~~ Decided 2026-11-13: small hosted reverse-geocoding service behind a swappable interface, results stored in our database (R24).
- Q5. Check-ins from a revoked device that never synced: reject, or hold for admin review (recommended)? See [device-trust.md](device-trust.md).
