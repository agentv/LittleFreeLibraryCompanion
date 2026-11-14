# LFL Steward Companion: Features and Data Model (draft)

Status: planning only, nothing built yet. Stack: React Native + Expo (TypeScript); backend self-hosted Supabase on Vincent's servers, photos and audio in his Amazon S3 (decided 2026-11-09).
Date: 2026-11-09

## 1. Features

### MVP
- **Library list and map.** See the libraries you steward (or have visited) as a list and on a map.
- **Add a library.** Name, optional charter number, a cover photo, GPS location captured automatically, and street address filled in from the GPS (reverse geocoding) with manual editing.
- **Municipal info.** Street address, city, county, state/province, postal code, country. Stored with the library, editable.
- **Log a visit.** Each trip to a library is a *visit* with a timestamp, the GPS where you were standing, and any number of attachments.
- **Photos.** Take or pick several photos at once; they are kept together as a group on that visit (and so on that library). Optional caption per photo.
- **Audio note.** Record a voice note on a visit, with playback. Duration shown. Limited to 90 seconds (recording stops automatically, with a countdown in the last 10 seconds).
- **Text comment.** Type a note on a visit.
- **Photos on a comment.** A comment can carry its own photos (e.g. "door hinge broken" plus two close-ups).
- **Photo roles.** Three suggested photos on each visit, shown as slots to fill: **Shelf** (book titles readable), **Establishing shot** (the library as you approach from the road), and **Location** (street address placard or the crossroads street signs). The steward can take as many photos as they like and picks which one fills each slot. Slots are encouraged but not required. The library page shows the most recent photo for each role, and the latest establishing shot is the library's cover by default.
- **Condition check on each visit.** Optional one-tap answers: book stock (empty / low / good / overflowing), condition (good / needs cleaning / damaged), door and latch working (yes / no), anything removed (yes / no). Library list shows the latest condition, and admins can filter for libraries that need attention.
- **Works offline.** Everything above can be captured with no signal and syncs later.
- **Sign-in.** Stewards create their account first on a web sign-up form (outside the app); the app only signs in, by email link or code, with a link to the form.

### Later
- Read book titles from shelf photos automatically.
- Condition trends over time (e.g. "low on books for 3 visits") and repair reminders.
- Reminders to revisit a library ("not checked in 14 days").
- Multiple stewards sharing one library, with roles.
- Public/neighbor view or sharing a library page link.
- Audio transcription so voice notes are searchable.
- Book inventory (scan ISBN for books added/taken).
- Export (CSV/PDF) of a library's history.
- Import or link to the official Little Free Library map listing.

## 2. How photos and audio attach

Photos, audio, and comments always belong to a **visit**, and every visit belongs to one **library**. So "the photos of this library" is simply all photos across its visits. This keeps a record of *when* each photo was taken, which matters for tracking condition over time.

- Several photos taken together on a visit share that visit, so they stay grouped automatically.
- A photo attached to a comment points at the comment as well (it shows inside the comment, and still appears in the library's gallery).
- The library's cover photo is just a pointer to one of its photos, defaulting to the latest establishing shot.
- A photo can carry a role (shelf, establishing, location). Roles are set per visit, so the library keeps a history of each, e.g. how the shelf looked on every visit.
- When you first add a library, the app creates the first visit behind the scenes, so the setup photos have a home too.

## 3. Data model

```
User 1───* Library (created_by) 1───* Visit 1───* Attachment
                                       │                      ▲
                                       └─ cover_photo_id ─────┘
Visit 1───* Comment 1───* Attachment (photo, via comment_id)
```

**User** (Supabase auth)
- id, display_name, email, created_at
- role: `steward` | `admin`
- status: `pending` | `active` | `suspended` (admins approve new members; only active members can submit)

**Library**
- id (UUID, generated on the phone)
- name, charter_number (optional), description
- latitude, longitude, location_accuracy_m
- address_line, city, county, region (state/province), postal_code, country
- address_source: `geocoded` | `manual`
- cover_photo_id → Attachment (nullable; if empty, use the latest establishing shot)
- created_by → User, created_at, updated_at, deleted_at (soft delete)

(LibraryMembership dropped for MVP: edit rights come from who created a record plus the admin role. Can return later if libraries get assigned stewards.)

**Visit**
- id, library_id, user_id
- visited_at
- latitude, longitude, location_accuracy_m (where the phone was)
- stock_level: `empty` | `low` | `good` | `overflowing` (nullable)
- condition: `good` | `needs_cleaning` | `damaged` (nullable)
- door_ok: boolean (nullable)
- items_removed: boolean (nullable)
- created_at, updated_at, deleted_at

**Comment**
- id, visit_id, user_id
- body (text)
- created_at, updated_at, deleted_at

**Attachment** (one table for photos and audio)
- id, visit_id, comment_id (nullable; set when it belongs to a comment)
- kind: `photo` | `audio`
- storage_path (remote, once uploaded), local_uri (on device)
- thumbnail_storage_path, thumbnail_local_uri (thumbnail made on the phone, 320 px)
- mime_type, size_bytes
- width, height (photo); duration_s (audio)
- role: `shelf` | `establishing` | `location` (nullable; photos only; at most one per role per visit)
- caption, sort_order
- captured_at, latitude, longitude (from the device/EXIF, when available)
- upload_status: `pending` | `uploading` | `done` | `failed` (device only)
- created_at, deleted_at

Why a single Attachment table: one upload queue, one gallery query, and adding a new kind later (video, document) needs no new table.

## 4. Offline-first and sync

- **Local database first.** All writes go to an on-device SQLite database (expo-sqlite, possibly with a sync layer such as PowerSync or WatermelonDB if Supabase is chosen). The UI reads only from the local database, so it is fast and identical online or offline.
- **IDs made on the phone** (UUIDs), so records can be created offline and linked to each other without waiting for the server.
- **Two queues.** Rows (small, sync quickly) and files (large, upload separately). A visit appears on the server right away; its photos and audio fill in as they upload.
- **Files saved to the app's own storage immediately** after capture, never only in a temp folder, so nothing is lost if the app closes.
- **Upload on Wi-Fi option** and image resizing/compression before upload (keep originals locally until uploaded).
- **Retries with backoff**, resume after the app restarts, and a visible "3 items waiting to upload" indicator.
- **Conflicts.** MVP is mostly one steward per library and data is append-heavy (new visits, new photos), so "last write wins" per field on Library and Comment is enough. Deletes are soft (deleted_at) so they sync cleanly.
- **Permissions.** Camera, microphone, location (while in use only), photo library. Ask at the moment each is first needed.
- **Addresses are the steward's job** (updated 2026-11-13). The steward types or confirms the address. As a nice-to-have, the server may send back suggested addresses after sync; the steward picks, edits or ignores them. The server never sets an address itself.
- **Server security.** Row-level security: any signed-in steward can read everything and create visits; update/delete only if `created_by`/`user_id` = you, or your role is `admin`.

## 5. Decisions (2026-11-09)

- Users are stewards only for now.
- Condition check on each visit is in the MVP.
- Photo roles (shelf, establishing, location) are in the MVP, chosen per visit.
- Libraries are not private: any signed-in steward can see every library and add visits to it.
- Edit rights: you can edit or delete anything you submitted (library, visit, comment, photo, audio). Administrators can edit anything.
- Backend (DECIDED 2026-11-09): no monthly hosted fees. Self-host the open-source Supabase stack on Vincent's own servers, with photos and audio stored in his Amazon S3 (see section 7).

## 6. Open questions

1. (Answered above.)
2. (Answered above.)
3. (Answered: condition check is in MVP.) Confirm the four items are the right ones.
4. (Answered: voice notes are limited to 90 seconds.)
5. Is linking to the official Little Free Library charter number/map important, or just a nice-to-have?
6. Any need to export or print a library's history?
7. (Answered: author or admin can edit.)

## 7. Hosting without monthly fees (decided)

- **Database, sign-in, API:** self-hosted Supabase (open source, runs in Docker) on Vincent's own servers. Same features as the hosted version, so the rest of this plan doesn't change, and there are no per-user or per-GB fees.
- **Photos and audio:** Vincent's Amazon S3 bucket. The app uploads directly to S3 using short-lived signed links, so files never pass through our servers.
- **Still on us when self-hosting:** nightly database backups (to S3), applying updates, keeping the server reachable over HTTPS, and an email sender for sign-in links.
- **Fallback options** if Supabase self-hosting feels heavy: PocketBase (single small program, simpler, less mature) or plain Postgres with a small custom API.

## 8. Interface decisions (2026-11-09)

- Look: "Neighborly" (warm terracotta, rounded shapes, Nunito). Mockups: https://claude.ai/artifact/9RVUvFKBxKxCAkaf224tPD
- Main screen: library card for the library you're at (establishing photo, last condition as a sentence, three photo-role slots, voice/note buttons, "Check in here").
- Check-in is a 4-step wizard (LOCKED 2026-11-09): 1 Photos (Shelf → Establishing → Location, each skippable, then extras) → 2 Condition (optional, Skip this step) → 3 Notes (optional, Skip this step) → 4 Review and finish (Edit link per section; saves offline and uploads later).
- Why a wizard: it trains stewards as they go, so someone who skipped or never had training can still work through to what's requested.
- Final mockups: https://claude.ai/artifact/To3khS88bJjE6MjPKMdFn7
- Themes (light, dark, high contrast at minimum) are required; to be designed later.

## 9. Architecture decisions (2026-11-09)

- ~~The app repo is client only.~~ Changed 2026-11-14: the repo holds both products, `mobile/` (the app) and `server/` (backend service and infrastructure), developed independently with their own dependencies and builds. Contract: docs/backend-requirements.md, including a section for requirements the server sends back.
- Vendor-dependent parts are swappable subsystems behind interfaces: **sync** (local store, row sync, media upload) and **membership** (sign-in, roles, member status, permissions, curating who contributes).
- Design work lives in a local-only design/ folder (gitignored); copy kept in /mnt/project-files/design/.

## 10. More decisions (2026-11-09)

- New libraries do not need admin approval; any active steward can add one, admins can edit or remove it.
- Photo thumbnails are made on the phone and uploaded with each photo.
- The backend keeps a rich change history: who changed what, when, and each field's before and after values (append-only). How long it's kept and who can see it is still open.

## 11. Location, server and devices (2026-11-10)

- **Location problems are handled on the phone:** permission denied, location turned off, no fix, low accuracy (over 50 m), stale cached position, mocked position. Each shows a plain message and offers retry, open Settings, or place the library on a map. A check-in never blocks on location; visits can be saved without a position. New libraries need a position (GPS or map pin).
- **Address lookup on the server during sync**, using a self-hostable geocoder (no per-request fees).
- New fields: Library `location_source` (gps / last_known / manual_pin) and `address_status` (pending / resolved / failed / manual); Visit `location_source`; every record `created_on_device_id`; new **Device** table.
- **Server subsystem** on the client: the single, replaceable path to the backend.
- **Device verification and authentication:** proposed design in the app repo's docs/device-trust.md (hardware-backed device key, App Attest / Play Integrity, signed requests, revocable devices). Six open questions there.

## 12. Accounts and device trust (2026-11-13)

- Accounts are created on a web sign-up form run by the backend, before using the app. New accounts wait for admin approval.
- A device is trusted as soon as Apple/Google attestation passes; if it fails, it stays pending for an admin. No limit on devices per member. Shared phones are not supported.
- Device trust expires 30 days after the last verification; the app renews it quietly before then. Trust also ends when the device is removed.
- Device gets `last_verified_at` and `trust_expires_at`.
- Still open: what to do with unsynced check-ins from a revoked device (recommended: hold for admin review).

## 13. Address suggestions are a nice-to-have (2026-11-13)

- Stewards are responsible for every library's street address. Coordinates often match several addresses, so the steward always picks or confirms one.
- Nice-to-have: after a library syncs, the server may offer up to 5 suggested addresses (hosted lookup service). The app shows "Suggested addresses" under the address field; tap one to fill the field, then edit or confirm.
- It can be dropped at any time: a single switch turns it off, and nothing else depends on it.
- A library can be saved without an address; it shows "Address needed" until the steward adds one.
- Data model: Library `address_source` is typed or suggestion; `address_status` is missing or confirmed. Suggestions live in their own AddressSuggestion table.
