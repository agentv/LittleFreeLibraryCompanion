import type { AuthProvider } from './auth/gotrue.js';
import type { Pool } from './db/pool.js';
import type { AttestationVerifier } from './devices/attestation.js';
import type { MediaStorage } from './media/storage.js';

/** Everything the app needs from outside, so tests and new hosts can swap any piece. */
export interface Deps {
  pool: Pool;
  jwtSecret: string;
  publicUrl: string;
  apiVersions: string[];
  auth: AuthProvider;
  attestation: AttestationVerifier;
  media: MediaStorage;
  now: () => Date;
}
