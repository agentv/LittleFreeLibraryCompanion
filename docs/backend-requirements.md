# Backend requirements

The backend and infrastructure are a separate project. This document is the contract between the two: what this app needs from the backend, and (below) what the backend project needs from us. Update it whenever either side changes.

Status: draft, updated 2026-11-10.

## Context

- Hosting: self-hosted Supabase (Postgres, Auth, API) on the owner's own servers. No recurring hosted-service fees.
- Media: photos and audio in the owner's Amazon S3.
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
- R24. The geocoding service is replaceable on the server and, to avoid per-request fees, should be self-hostable (for example Nominatim or Pelias over OpenStreetMap data). Cache results.
- R25. Location sanity checks: flag (don't reject) visits more than 150 m from their library, positions reported as mocked, and low-accuracy fixes (over 50 m), so admins can review.
- R26. Accept visits with no position. Libraries always have a position, from GPS or placed on a map (`location_source = manual_pin`).

### 6. Devices (see [device-trust.md](device-trust.md))

- R27. Device registration: issue one-time challenges; register a device with its public key, signed challenge and attestation token; link it to the member.
- R28. Verify Apple App Attest and Google Play Integrity tokens. Passed → `trusted` (if the member is active); failed or unavailable → `pending` for admin approval.
- R29. On every request, check the access token, that the device is trusted and belongs to the member, the request signature against the stored public key, and a timestamp within 5 minutes.
- R30. Refresh tokens are bound to the device; revoking a device stops it at its next request.
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
- Q5–Q10. Device trust questions, listed in [device-trust.md](device-trust.md).
