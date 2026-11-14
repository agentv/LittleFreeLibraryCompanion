/**
 * Public entry point for the location subsystem. Import from here only.
 */
import { LOCATION } from '../config/limits';
import type { LocationProblem } from './types';
export type {
  LocationFix,
  LocationProblem,
  LocationProvider,
  LocationResult,
  PermissionState,
} from './types';

/** What the app tells the steward, and what it offers next, for each problem. */
export const LOCATION_PROBLEM_HANDLING: Record<
  LocationProblem,
  { message: string; actions: ('retry' | 'open_settings' | 'place_on_map' | 'continue')[] }
> = {
  permission_denied: {
    message: 'Location is off for this app. Allow it in Settings, or place the library on the map yourself.',
    actions: ['open_settings', 'place_on_map'],
  },
  services_off: {
    message: 'Location is turned off on this phone. Turn it on, or place the library on the map yourself.',
    actions: ['open_settings', 'place_on_map'],
  },
  no_fix: {
    message: "We couldn't find your position. Step outside or try again, or place the library on the map.",
    actions: ['retry', 'place_on_map'],
  },
  low_accuracy: {
    message: `Your position is only accurate to more than ${LOCATION.LOW_ACCURACY_M} m. Try again, or adjust the pin on the map.`,
    actions: ['retry', 'place_on_map', 'continue'],
  },
  stale: {
    message: 'We only have an old position. Try again for a fresh one, or adjust the pin on the map.',
    actions: ['retry', 'place_on_map', 'continue'],
  },
  mocked: {
    message: 'This position may not be real. Please turn off location mocking and try again.',
    actions: ['retry'],
  },
};

/**
 * A visit can always be saved, even without a position; the check-in
 * never blocks on location. A new library needs some position, either
 * from the phone or placed on the map.
 */
export const NEW_LIBRARY_NEEDS_POSITION = true;
export const VISIT_NEEDS_POSITION = false;

/** Straight-line distance in meters (haversine). */
export function distanceM(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "40 m away", "1.2 km away". */
export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.max(1, Math.round(m / 10) * 10)} m`;
  return `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`;
}
