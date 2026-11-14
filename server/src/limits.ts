// Product limits enforced on the server (backend R9, R25, R29, R30a).
// The app has its own copy in mobile/src/config/limits.ts; keep them in step
// through docs/backend-requirements.md.

export const LIMITS = {
  audioMaxSeconds: 90,
  photoMaxBytes: 3 * 1024 * 1024,
  thumbnailMaxBytes: 200 * 1024,
  audioMaxBytes: 2 * 1024 * 1024,
  /** Photos are resized on the phone to a 1600 px long edge. */
  photoMaxEdgePx: 1600,
  uploadUrlTtlSeconds: 15 * 60,
  downloadUrlTtlSeconds: 60 * 60,
  /** Signed requests must be within this many ms of server time. */
  requestClockSkewMs: 5 * 60 * 1000,
  challengeTtlMs: 5 * 60 * 1000,
  deviceTrustDays: 30,
  /** Visits farther than this from their library are flagged. */
  visitFarFromLibraryM: 150,
  /** Fixes less accurate than this are flagged. */
  lowAccuracyM: 50,
  pullPageSize: 500,
  pushMaxRows: 500,
  bodyMaxBytes: 2 * 1024 * 1024,
} as const;
