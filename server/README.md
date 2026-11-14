# LFL Steward Companion: server

The backend for the mobile app: a **Node.js + TypeScript** service (Hono) in front of **Postgres** and **Supabase Auth**, with photos and audio in **Amazon S3**. The app talks only to this service (decided 2026-11-14). The API contract the app relies on is in [../docs/backend-requirements.md](../docs/backend-requirements.md), under "Requirements from the backend".

The server does not import code from `../mobile`, and the app doesn't import from here.

## What's here

| Path | What it does |
|---|---|
| `migrations/` | SQL schema: tables, row-level security, change-history triggers, review queue. Applied in name order by `src/db/migrate.ts`. |
| `src/http/context.ts` | The request pipeline: access token, then member, then the signed device (R29). |
| `src/auth/` | Sign-in through Supabase Auth, with token refresh tied to the device (R11, R30). |
| `src/devices/` | Challenges, registration, 30-day renewal, request-signature checks, and the attestation interface (R27 to R31). |
| `src/sync/` | Push (upsert, permissions, address conflicts, held inputs, location flags, media checks) and incremental pull (R1 to R5, R22a, R25, R32a). |
| `src/media/` | Presigned S3 uploads and downloads (R7 to R10). |
| `src/admin/` | Members, devices, the review queue and change history (R16, R21, R31). |
| `src/signup/` | The web sign-up form (R11a). |
| `docker/` | Compose file for Postgres, Supabase Auth, migrations and the service, with per-container memory limits. |
| `scripts/backup-db.sh` | Nightly database dump to S3 (R17). |

## How the rules are enforced

- **Row-level security** is the backstop: the service connects as role `lfl_api` and sets the member and device for each transaction, so Postgres itself enforces "read everything, write only when active, edit only what you created unless admin". The service checks the same rules first to give clear rejection reasons.
- **Change history** is written by database triggers, with who, which device, server time, device time and before/after per field. The app can't skip it.
- **Pull order** uses a server-assigned change number on every row. Writers take one advisory lock, so the numbers follow commit order and no row is ever skipped. At about 15 stewards, that costs nothing noticeable.
- **Addresses:** the steward's address is used unless it contradicts a confirmed one. Then the original stays and the proposal goes to the review queue.
- **Untrusted devices** (pending, failed attestation, expired, removed): their pushes are held in the review queue for an admin to accept or reject.

## Not built yet

- **Real App Attest / Play Integrity checks.** `src/devices/attestation.ts` has the interface. Until the Apple and Google accounts exist, every device registers as `pending` and an admin approves it.
- **Admin web pages.** The admin API is complete, but there's no screen for it yet.
- **Address suggestions** (nice-to-have, R22) and rate limiting.

## Develop

Requires Node.js 22 or later, and a Postgres 15+ for tests.

```bash
cd server
npm install
npm run typecheck
TEST_DATABASE_ADMIN_URL=postgres://postgres@localhost:5432/postgres npm test
npm run build
```

Each test file creates and drops its own database.

## Deploy (on the EC2 server)

1. Install Docker and the compose plugin. Copy `.env.example` to `docker/.env` and fill it in.
2. Give the instance an IAM role that can read and write the media bucket (and the backup bucket). Keep the bucket private.
3. `cd docker && docker compose up -d --build`. This runs migrations, then starts the service on `127.0.0.1:8080` and Supabase Auth on `127.0.0.1:9999`.
4. In the web server that already serves WordPress, add a virtual host for the API hostname with a Let's Encrypt certificate. Proxy `/auth/` to `127.0.0.1:9999/` (only needed for the sign-up confirmation link) and everything else to `127.0.0.1:8080`.
5. Make the first admin. Sign up on `/signup`, sign in on the app, then run `docker compose exec db psql -U postgres -d lfl -c "update members set role='admin', status='active' where email='you@example.org'; update devices set status='trusted', last_verified_at=now(), trust_expires_at=now()+interval '30 days' where member_id=(select id from members where email='you@example.org')"`. Admin calls need a trusted device, and until attestation is set up nobody else can approve the first admin's phone.
6. Set Supabase Auth's sign-in email template so it shows the 6-digit code (`{{ .Token }}`), because the app signs in with a code rather than a link.
7. Add `scripts/backup-db.sh` to cron with `BACKUP_BUCKET` set, and test a restore.

The compose file is checked with `docker compose config` but hasn't been run end to end yet.
