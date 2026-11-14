# LFL Steward Companion: server

The backend for the mobile app: a custom **Node.js + TypeScript** service plus the infrastructure it runs on. Only a placeholder entry point exists so far.

What it will hold (decisions in [../docs/backend-requirements.md](../docs/backend-requirements.md)):

- The custom service: device attestation checks, address lookup, sync and permission rules, change history helpers. Written on a small portable framework (for example Hono or Fastify) so it can move hosts without a rewrite.
- Configuration for a trimmed self-hosted Supabase stack (Postgres, Auth, REST API, Storage, gateway) in Docker, with its own compose file.
- Database schema and migrations, S3 bucket setup for signed uploads, and backup and monitoring scripts.

It runs on one of the owner's existing EC2 servers. No hosted or monthly services without asking first.

The server does not import code from `../mobile`. What the app needs from it, and what it needs from the app, is the contract in [../docs/backend-requirements.md](../docs/backend-requirements.md); keep it current.

## Getting started

Requires Node.js 22 or later.

```bash
cd server
npm install
npm run build
npm start
```

Checks before committing:

```bash
npm run typecheck
```
