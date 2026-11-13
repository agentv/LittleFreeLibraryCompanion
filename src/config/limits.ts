/** Product limits agreed in planning (see docs/features-and-data-model.md). */

/** Voice notes stop recording automatically at this length. */
export const MAX_VOICE_NOTE_SECONDS = 90;

/** Show a countdown during the last N seconds of a voice note. */
export const VOICE_NOTE_COUNTDOWN_SECONDS = 10;

/** Longest edge, in pixels, that photos are resized to before upload. */
export const PHOTO_MAX_EDGE_PX = 1600;

/** Location handling (src/location). */
export const LOCATION = {
  /** Keep trying for a better fix for this long. */
  FIX_TIMEOUT_MS: 20_000,
  /** Good enough to stop early. */
  DESIRED_ACCURACY_M: 15,
  /** Worse than this counts as low accuracy and is flagged. */
  LOW_ACCURACY_M: 50,
  /** A cached position older than this counts as stale. */
  STALE_AFTER_MS: 2 * 60_000,
  /** A visit more than this far from its library is flagged for review, not blocked. */
  VISIT_DISTANCE_WARNING_M: 150,
} as const;

/** Longest edge, in pixels, of thumbnails made on the phone and uploaded with each photo. */
export const THUMBNAIL_MAX_EDGE_PX = 320;

/** Device trust (docs/device-trust.md). */
export const DEVICE_TRUST = {
  /** Device credentials expire this long after the last verification. */
  VALID_DAYS: 30,
  /** Start quiet renewal this many days before expiry. */
  RENEW_BEFORE_DAYS: 5,
} as const;
