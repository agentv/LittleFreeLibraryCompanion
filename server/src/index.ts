// Entry point for the LFL Steward Companion backend service.
import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { createGoTrueProvider } from './auth/gotrue.js';
import { loadConfig } from './config.js';
import { createPool } from './db/pool.js';
import { NotConfiguredVerifier } from './devices/attestation.js';
import { createS3Storage } from './media/storage.js';

const config = loadConfig();
const app = createApp({
  pool: createPool(config.databaseUrl),
  jwtSecret: config.jwtSecret,
  publicUrl: config.publicUrl,
  apiVersions: config.apiVersions,
  auth: createGoTrueProvider(config.gotrueUrl, config.jwtSecret, config.publicUrl),
  // Real App Attest / Play Integrity verifiers plug in here once the Apple and
  // Google accounts exist. Until then every device registers as pending.
  attestation: new NotConfiguredVerifier(),
  media: createS3Storage(config.s3.bucket, config.s3.region),
  now: () => new Date(),
});

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`LFL Steward Companion server listening on :${info.port}`);
});
