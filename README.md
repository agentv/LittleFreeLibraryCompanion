# LFL Steward Companion

A mobile app for stewards of Little Free Libraries. On each visit a steward checks in at a library: takes photos (shelf, establishing shot, location), records the library's condition, and adds voice or written notes. It works offline and syncs later.

## Stack

- React Native + Expo (TypeScript), one codebase for iOS and Android.
- Backend: self-hosted Supabase (database, sign-in, API).
- Photos and audio: Amazon S3.

This repository is the client app only. The backend and infrastructure are a separate project; the contract between them is [docs/backend-requirements.md](docs/backend-requirements.md).

## Docs

- [Architecture](docs/architecture.md): client-only scope and swappable subsystems (`src/sync`, `src/membership`)
- [Backend requirements](docs/backend-requirements.md)
- [Features and data model](docs/features-and-data-model.md)

Design work lives in a local `design/` folder that is not pushed to this repository.

## Getting started

```bash
npm install
npx expo start
```

Checks before committing:

```bash
npx tsc --noEmit
npx expo lint
```
