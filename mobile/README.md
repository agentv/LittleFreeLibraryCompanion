# LFL Steward Companion: mobile app

The iOS and Android app, built with React Native + Expo (TypeScript). It is offline first: local SQLite is what the UI reads, and rows and media sync to the backend later.

The app talks to the backend only through `src/server` and only as described in [../docs/backend-requirements.md](../docs/backend-requirements.md). Its subsystems (`src/sync`, `src/membership`, `src/server`, `src/location`) are described in [../docs/architecture.md](../docs/architecture.md). Expo-specific rules are in [AGENTS.md](AGENTS.md).

## Getting started

```bash
cd mobile
npm install
npx expo start
```

Checks before committing:

```bash
npx tsc --noEmit
npx expo lint
```

Add packages with `npx expo install <package>` so versions match the Expo SDK.
