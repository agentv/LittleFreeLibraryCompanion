# Backend requirements

The backend and infrastructure are a separate project. This document is the contract between the two: what this app needs from the backend, and (below) what the backend project needs from us. Update it whenever either side changes.

Status: draft, 2026-11-09.

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

- R7. Short-lived signed upload URLs for S3, issued only to active members, so the app uploads files straight to S3.
- R8. Short-lived signed download URLs (or a CDN path) for viewing photos and playing audio.
- R9. Limits enforced server-side too: audio at most 90 seconds; photos resized by the client to a 1600 px long edge, so reject anything unreasonably large.
- R10. Thumbnails for photos (generated server-side or by the client; to be agreed) so lists don't download full images.

### 3. Membership and permissions (used by `src/membership`)

- R11. Email sign-in (magic link or one-time code). Apple/Google sign-in later.
- R12. Roles: `steward`, `admin`.
- R13. Member status: `pending` (signed up, awaiting approval), `active`, `suspended`. Admins approve new members, so inputs to the data set are curated.
- R14. Only active members can create libraries, visits, comments or attachments. Pending and suspended members can sign in and read.
- R15. A member can edit or delete what they created; admins can edit anything. Enforced with row-level security, not just in the app.
- R16. Admin endpoints: list members by status, approve, suspend (with reason), change role.

### 4. Operations

- R17. Nightly database backups (to S3) and a tested restore.
- R18. HTTPS on all endpoints.
- R19. An email sender for sign-in links.
- R20. A stable, versioned API so the app can keep working while the backend evolves. Breaking changes need a new version and notice in this document.

## Requirements from the backend

The backend project adds items here as it makes decisions that affect the app (for example API versions, rate limits, file-size limits, auth flow details). Each entry: date, requirement, what the app must change.

- (none yet)

## Open questions

- Q1. Does a new library also need admin approval, or only new members?
- Q2. Thumbnails: made by the client before upload, or by the server?
- Q3. Do we need audit history (who changed what), beyond updated_at?
