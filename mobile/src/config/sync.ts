/** Sync timing (src/sync). */
export const SYNC = {
  /** Run a sync this often while the app is open. */
  INTERVAL_MS: 60_000,
  /** After a failure, wait this long, doubling up to the max. */
  BACKOFF_START_MS: 5_000,
  BACKOFF_MAX_MS: 10 * 60_000,
  /** Server limit per push (backend: at most 500 rows). */
  PUSH_BATCH_ROWS: 200,
  /** Check this device's trust at most this often. */
  TRUST_CHECK_MS: 60 * 60_000,
} as const;
