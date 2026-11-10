/**
 * Public entry point for the location subsystem. Import from here only.
 */
export type {
  LocationFix,
  LocationProblem,
  LocationProvider,
  LocationResult,
  PermissionState,
} from './types';

import { LOCATION } from '../config/limits';
import type { LocationProblem } from './types';

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
