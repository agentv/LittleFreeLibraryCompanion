# Backend requirements

The backend lives in `server/` and the app in `mobile/`; they are developed independently. This document is the contract between the two: what the app needs from the backend, and (below) what the backend needs from the app. Update it whenever either side changes.

Status: draft, updated 2026-11-14 (API shape, address conflicts and held inputs decided; first server build; first app build).

## Context

- **The app talks only to the Node service** (decided 2026-11-14), under `/v1`. The service checks the access token, the device and the request signature on every call, then reads and writes Postgres as that member so row-level security still applies. Supabase Auth handles sign-in, but the app reaches it only through the service, so token refresh can be tied to the device (R30).
- Hosting: self-hosted Postgres and Supabase Auth on the owner's own servers. No per-user or per-GB hosted-service fees; the only added cost is the server resize below.
- Media: photos and audio in the owner's Amazon S3.
- Custom server logic (attestation checks, address lookup, sync and permission rules, change history helpers) is written in **Node.js + TypeScript** (decided 2026-11-13). The app is TypeScript too, so the data shapes in `mobile/src/types/models.ts` and the request/response types can be shared, for example as a small shared package both `mobile/` and `server/` depend on, instead of being written twice.
- Hosting (decided 2026-11-13, replaces the earlier Lambda-first plan): **one of the owner's existing low-traffic EC2 servers, resized one step** (for example t3.small → t3.medium, about $15 a month more; it has about 2.6 GB free memory and 1 GB swap today). Everything for the backend runs there:
  - a **trimmed stack** in Docker (`server/docker/compose.yml`): Postgres and Supabase Auth (sign-in). ~~The REST API layer, Storage and the gateway~~ are dropped (2026-11-14): the Node service signs S3 links itself and is the only API, so they aren't needed. Realtime, analytics, Studio and edge functions stay out too.
  - the **custom Node.js + TypeScript service** (attestation checks, address lookup, sync and permission rules), written on a small portable framework (for example Hono or Fastify) so it can later move to Lambda or its own server without a rewrite.
- WordPress keeps its own MySQL/MariaDB on the same server; the two don't share a database.
- Photos and audio still go **straight from the phone to S3** with short-lived signed links (R7); they never pass through the server.
- Expected peak is small (about 15 stewards each sending 8 to 10 updates on one morning). The Node service keeps a small connection pool to Postgres; a separate pooler is only needed if the code moves to Lambda later.
- Operations on the shared server: keep swap enabled (grow it to about 2 GB after resizing), set memory limits per container so the app can't starve WordPress, **back up both WordPress and Supabase** nightly to S3 with a tested restore (R17), and **monitor memory and disk** with alerts (for example CloudWatch agent).
- The client is offline-first: it creates records on the device with its own UUIDs and syncs later. The data model is in [features-and-data-model.md](features-and-data-model.md) and `mobile/src/types/models.ts`.

## What the app needs from the backend

### 1. Data and sync (used by `mobile/src/sync`)

- R1. Tables for libraries, visits, comments, attachments and members, matching the client data model. Primary keys are client-generated UUIDs; the server must accept them as-is.
- R2. Upsert by id. Pushing the same record twice must be safe (idempotent).
- R3. Incremental pull: "give me everything changed since cursor X", including soft-deleted rows (deleted_at set), plus a new cursor.
- R4. Conflict rule: last write wins per record, using a server-assigned `updated_at`. Report rejected writes with a reason (e.g. permission denied).
- R5. Soft deletes only (deleted_at); no hard deletes from the client.
- R6. Every library and visit is readable by any signed-in active member (libraries are not private).

### 2. Media (used by `mobile/src/sync`)

- R7. Short-lived signed upload URLs for S3, issued only to active members on trusted devices, so the app uploads files straight to S3.
- R8. Short-lived signed download URLs (or a CDN path) for viewing photos and playing audio.
- R9. Limits enforced server-side too: audio at most 90 seconds; photos resized by the client to a 1600 px long edge, so reject anything unreasonably large.
- R10. Thumbnails are made on the phone (320 px long edge) and uploaded alongside each photo. The backend stores both and issues signed URLs for each; it does not need to generate thumbnails.

### 3. Membership and permissions (used by `mobile/src/membership`)

- R11. Email sign-in (magic link or one-time code). Apple/Google sign-in later.
- R11a. **Web sign-up form** run by the backend, usable in a phone browser. Accounts are created there, not in the app. New accounts start `pending`. The app links to this form; it has no sign-up screen of its own.
- R11b. **Account page on the web** (added 2026-11-14 by the first app build): the profile screen's "Edit account on the web" opens `https://<host>/account`, where a member changes their name or email. Not built on the server yet; until it is, the link lands on a 404.
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

- R22a. **Address conflicts (decided 2026-11-14).** Turning coordinates into an address is an afterthought: the server records and keeps the position but never decides an address during sync. The address a steward submits is the one used, unless the library already has a confirmed address and the new one contradicts it (including clearing it). Then the original stays in place, the rest of the change is applied, and the proposed address goes to the admin review queue. Admins' own edits apply directly. Differences only in spacing or capital letters don't count.
- R22. **Nice-to-have, not a blocker (2026-11-13): address suggestions.** Stewards are responsible for entering each library's street address. As a convenience, when a library syncs with coordinates, the server may look up likely addresses and return up to 5 **suggestions** (ranked) on the next pull. Coordinates often match several addresses, so suggestions are only offered; the steward picks, edits or ignores them. This feature can be dropped at any time without affecting anything else.
- R23. The server **never writes or changes a library's address**. Only a steward (or an admin) sets it. Suggestions live in their own table, separate from the library.
- R24. If built, suggestions come from a **small hosted reverse-geocoding service** (coverage can't be limited to one region, so self-hosting is out), behind a replaceable geocoder interface in the Node service. Results are stored and cached by rounded coordinates so the same spot is never paid for twice. The API key stays on the server. The provider's terms must allow storing results.
- R25. Location sanity checks: flag (don't reject) visits more than 150 m from their library, positions reported as mocked, and low-accuracy fixes (over 50 m), so admins can review.
- R26. Accept visits with no position. Libraries always have a position, from GPS or placed on a map (`location_source = manual_pin`). A library may be saved without an address (`address_status = missing`); the app reminds the steward to add it.

### 6. Devices (see [device-trust.md](device-trust.md))

- R27. Device registration: issue one-time challenges; register a device with its public key, signed challenge and attestation token; link it to the member.
- R28. Verify Apple App Attest and Google Play Integrity tokens. Passed → `trusted` straight away; failed or unavailable → `pending` until an admin approves. No limit on devices per member. One member per device (no shared phones).
- R29. On every request, check the access token, that the device is trusted and belongs to the member, the request signature against the stored public key, and a timestamp within 5 minutes.
- R30. Refresh tokens are bound to the device; revoking a device stops it at its next request.
- R30a. Device trust **expires 30 days** after the last successful verification. Support re-verification (new challenge, signature and attestation) before expiry without signing in again, and after expiry with a fresh sign-in. Return `device_untrusted` with an `expired` reason so the app can renew.
- R31. Device endpoints: list my devices, revoke mine; admins list, approve and revoke any.
- R32. Stamp every record and change-history entry with the device it came from.
- R32a. **Held inputs (decided 2026-11-14).** Anything pushed from a device that isn't trusted (pending, failed attestation, trust expired, or removed) is held in the admin review queue, not applied and not thrown away. An admin accepts it (applied as the member who made it, from that device) or rejects it.

## Requirements from the backend

The server side adds items here as it makes decisions that affect the app (for example API versions, rate limits, file-size limits, auth flow details). Each entry: date, requirement, what the app must change.

- 2026-11-14, first server build (`server/`). What the app must do:
  - **API base:** `https://<host>/v1`. `GET /v1/health` returns `{ apiVersions, serverTime }`. An unknown version answers 410 `version_unsupported`.
  - **Errors:** `{ "error": { "code", "message", "deviceReason"? } }`. Codes are those in `mobile/src/server/types.ts`, plus `bad_request` (400) and `not_found` (404), which the app should add.
  - **Sign-in:** `POST /v1/auth/code { email }` (always 204), `POST /v1/auth/verify { email, code }` returns `{ accessToken, refreshToken, expiresIn, userId }`. `POST /v1/auth/refresh { refreshToken }` must be signed by a registered, non-removed device of the same member. `GET /v1/me` returns the member (role and status) and needs only the access token. The sign-up form is at `https://<host>/signup`.
  - **Device key:** ECDSA P-256, public key sent as base64 SPKI DER. Signatures are ECDSA SHA-256, base64 DER.
  - **Every signed request** carries `Authorization: Bearer <access token>`, `X-Device-Id`, `X-Timestamp` (ISO 8601, within 5 minutes of server time) and `X-Signature` over the string `METHOD + "\n" + path with query + "\n" + hex SHA-256 of the exact body bytes ("" for none) + "\n" + X-Timestamp`.
  - **Device registration:** `POST /v1/devices/challenge` returns `{ challenge, expiresAt }` (5 minutes, single use). `POST /v1/devices/register { deviceId, publicKey, platform, model, appVersion, challenge, challengeSignature, attestationToken }`, where challengeSignature signs the challenge string itself. This call is not request-signed. Renewal is `POST /v1/devices/verify { challenge, challengeSignature, attestationToken, appVersion }`, signed, before or after the 30-day expiry. `GET /v1/me/devices` and `POST /v1/me/devices/:id/revoke` are for managing your own devices.
  - **Push:** `POST /v1/sync/push { changes: { libraries?, visits?, comments?, attachments? } }`, at most 500 rows, in the app's camelCase model. Device-only fields (`localUri`, `thumbnailLocalUri`, `uploadStatus`) and `updatedAt` are ignored. Visits may add `positionMocked: boolean` (new field, R25). The reply is `{ accepted[], rejected[{table,id,reason}], held[{table,id,reason}], flagged[{table,id,reason}] }`. Held rows are waiting for an admin: keep them on the phone, mark them as waiting, and don't resend them. Flagged means the row was applied but part of it (an address) is waiting for an admin. Rejection reasons: `invalid: …`, `owner_mismatch`, `device_mismatch`, `permission_denied`, `member_not_active`, `parent_missing`, `role_taken`, `file_missing`, `file_too_large`, `audio_too_long`, `unsupported_type`, `batch_too_large`.
  - **Pull:** `GET /v1/sync/pull?cursor=<opaque>` returns `{ changes, cursor, hasMore, serverTime }`. Repeat while `hasMore`. Rows include `updatedAt`. Visits also include `flagFarFromLibrary`, `flagLowAccuracy` and `flagMocked`, and attachments include `createdBy`. No cursor means from the start.
  - **Media:** sync the visit row first, then `POST /v1/media/upload-urls { attachmentId, visitId, kind, mimeType }`. It returns presigned POSTs `{ url, fields, key, expiresAt }` for the file and, for photos, the thumbnail. Send a multipart form with the fields, then `file`. Then push the attachment with `storagePath` (and `thumbnailStoragePath`) set to those keys, and the server checks the files are there. Limits: photo 3 MB, thumbnail 200 KB (JPEG), audio 2 MB and 90 s. `POST /v1/media/download-urls { paths[] }` returns `{ urls: { path: url }, expiresAt }` (1 hour).

- 2026-11-14, Q11: `GET /v1/sync/pull` now accepts any registered device that hasn't been removed (pending, failed attestation or expired), not only trusted ones. A removed device still gets `device_revoked`. `/media/*` and admin calls still need a trusted device, and pushes from untrusted devices are still held. What the app must change: let a pending or expired phone pull (done in the app's sync gate).

## What the app does (first app build, 2026-11-14)

How `mobile/` uses the contract above, so the server side can check its assumptions:

- **Base URL** comes from `EXPO_PUBLIC_API_URL` (the origin, no `/v1`). The app signs the path as `/v1/...` plus the query, so a reverse proxy must pass paths through unchanged.
- **Sign-in:** `/auth/code`, `/auth/verify`, then `GET /me` with the new token. Refresh is signed and tried once on any `unauthorized`; if it fails for a reason other than being offline, the app asks the steward to sign in again (the device key and unsent work stay).
- **Device:** registers right after sign-in with `attestationToken: null` (attestation unavailable in this build). Renews with `/devices/verify` from 5 days before `trustExpiresAt`, or straight away after a `device_untrusted` / `expired`. While the phone is pending it checks `GET /me/devices` on every sync to notice approval.
- **Push:** rows are sent per table, parents first, at most 200 per call. `held` rows are kept and not resent; `flagged` rows are shown as waiting for an admin; `rejected` rows are shown with the reason and not resent until edited, except `parent_missing` and `file_missing`, which are retried. Attachments go first with `storagePath: null`, then again with the keys after the files are in S3.
- **Media:** photos are JPEG (1600 px long edge, quality 0.8) with a JPEG thumbnail (320 px); voice notes are `audio/mp4` (.m4a) from the phone's recorder, at most 90 s.
- **Visits** send `positionMocked` when the phone says the position may be faked.
- **Admin screens** in the app use `GET/POST /admin/members`, `/admin/devices` and `/admin/review` (open items only).
- **Gate:** a member who isn't `active` doesn't push (their check-ins wait on the phone). A pending or expired phone pulls and pushes (its rows are held) but can't upload files, because `/media/*` needs a trusted device. A removed phone does none of these.

## Decisions on earlier questions (2026-11-09)

- New libraries do not need admin approval (R14).
- Thumbnails are made on the phone (R10).
- Keep a rich change history (R21). Whether it is "full" (every field, forever) is still open; see Q4.

## Open questions

- Q4. How long is change history kept, and do stewards see a library's history or only admins? Built default (2026-11-14): kept forever, admins only. Confirm or change.
- Q6. ~~Where does Postgres run?~~ Decided 2026-11-13: in the trimmed Supabase stack on the resized existing EC2 server, alongside WordPress (see Context).
- Q7. ~~Address lookup service?~~ Decided 2026-11-13: small hosted service behind a swappable interface (R24); the whole feature is a nice-to-have (R22).
- Q5. ~~Check-ins from a revoked device that never synced?~~ Decided 2026-11-14: held for admin review, as for any untrusted device (R32a).
- Q8. ~~Does the app call the Supabase REST layer or the Node service?~~ Decided 2026-11-14: the Node service only (see Context).
- Q9. Email sender for sign-in codes (R19): Amazon SES is the suggestion (pay per use, no monthly fee), but it's a new service, so it needs the owner's OK.
- Q11. ~~Can a phone waiting for approval read the libraries?~~ Decided 2026-11-14: yes. `GET /v1/sync/pull` answers for any registered, non-removed device (reads only); pushes from untrusted devices stay held and media still needs a trusted device. See the 2026-11-14 entry under "Requirements from the backend".
- Q10. Apple App Attest and Google Play Integrity verifiers need the Apple Team ID, the app's bundle id, a Google Cloud project and a Play Console app. Until they exist, every new device registers as pending and an admin approves it.
