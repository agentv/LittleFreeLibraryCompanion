/**
 * Location subsystem contract: getting the phone's position and handling
 * everything that can go wrong. The phone never turns coordinates into an
 * address; the server does that during sync (docs/backend-requirements.md R22).
 * Vendor code (expo-location) lives in src/location/adapters/<vendor>/.
 */
import type { ISODateTime, LocationSource } from '../types/models';

export interface LocationFix {
  latitude: number;
  longitude: number;
  /** Radius in meters the phone is confident about. */
  accuracyM: number | null;
  source: LocationSource;
  takenAt: ISODateTime;
}

/**
 * permission_denied: the steward said no (or "never") to location access.
 * services_off: location is turned off for the whole phone.
 * no_fix: no position within the time limit (indoors, poor signal).
 * low_accuracy: a position, but too vague to trust for a library.
 * stale: only an old cached position is available.
 * mocked: the OS reports the position may be faked (Android mock location).
 */
export type LocationProblem =
  | 'permission_denied'
  | 'services_off'
  | 'no_fix'
  | 'low_accuracy'
  | 'stale'
  | 'mocked';

export type LocationResult =
  | { ok: true; fix: LocationFix; warnings: LocationProblem[] }
  | { ok: false; problem: LocationProblem; bestEffort: LocationFix | null };

export type PermissionState = 'granted' | 'denied' | 'undetermined';

/** One implementation per platform library. */
export interface LocationProvider {
  getPermission(): Promise<PermissionState>;
  /** Ask only when the steward first needs location (e.g. starting a check-in). */
  requestPermission(): Promise<PermissionState>;
  servicesEnabled(): Promise<boolean>;
  /** Try for a fresh fix, keep the best one, stop at the time limit. */
  getFix(options: { timeoutMs: number; desiredAccuracyM: number }): Promise<LocationResult>;
  /** Open the phone's settings so the steward can allow access or turn location on. */
  openSettings(): Promise<void>;
}
