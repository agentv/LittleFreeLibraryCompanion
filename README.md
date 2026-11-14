# LFL Steward Companion

A mobile app for stewards of Little Free Libraries, and the backend that serves it. On each visit a steward checks in at a library: takes photos (shelf, establishing shot, location), records the library's condition, and adds voice or written notes. The app works offline and syncs later.

## Repository layout

This repository holds two separate products. Each lives in its own top-level folder and is developed independently, with its own dependencies, lockfile, build, checks and README.

| Folder | What it is | Stack |
|---|---|---|
| [`mobile/`](mobile/README.md) | The iOS and Android app | React Native + Expo (TypeScript) |
| [`server/`](server/README.md) | The backend service and its infrastructure | Node.js + TypeScript, self-hosted Supabase, Amazon S3 |
| [`docs/`](docs/) | Planning docs shared by both sides | Markdown |

Rules for working across the two:

- Run commands from inside `mobile/` or `server/`; there is no root `package.json`.
- Neither side imports code from the other's folder. They meet only at the contract in [docs/backend-requirements.md](docs/backend-requirements.md), which both keep current.
- A change to one side should not need a change to the other unless the contract changes; when it does, update the contract in the same change.

Design work lives in a local `design/` folder that is not pushed to this repository.

## Docs

- [Architecture](docs/architecture.md): scope and the app's swappable subsystems
- [Backend requirements](docs/backend-requirements.md): the contract between `mobile/` and `server/`
- [Features and data model](docs/features-and-data-model.md)
- [Device trust](docs/device-trust.md)
