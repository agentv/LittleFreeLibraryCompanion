/** LocationProvider on expo-location, with the problem handling in src/location/index.ts. */
import * as Location from 'expo-location';
import { Linking } from 'react-native';
import { LOCATION } from '../../../config/limits';
import type { LocationFix, LocationProblem, LocationProvider, LocationResult, PermissionState } from '../../types';

function toState(status: Location.PermissionStatus): PermissionState {
  if (status === Location.PermissionStatus.GRANTED) return 'granted';
  if (status === Location.PermissionStatus.DENIED) return 'denied';
  return 'undetermined';
}

function toFix(o: Location.LocationObject, source: LocationFix['source']): LocationFix {
  return {
    latitude: o.coords.latitude,
    longitude: o.coords.longitude,
    accuracyM: o.coords.accuracy ?? null,
    source,
    takenAt: new Date(o.timestamp).toISOString(),
    mocked: o.mocked === true,
  };
}

function warningsFor(fix: LocationFix): LocationProblem[] {
  const w: LocationProblem[] = [];
  if (fix.mocked) w.push('mocked');
  if (fix.accuracyM !== null && fix.accuracyM > LOCATION.LOW_ACCURACY_M) w.push('low_accuracy');
  if (Date.now() - Date.parse(fix.takenAt) > LOCATION.STALE_AFTER_MS) w.push('stale');
  return w;
}

export function createExpoLocationProvider(): LocationProvider {
  return {
    async getPermission() {
      return toState((await Location.getForegroundPermissionsAsync()).status);
    },
    async requestPermission() {
      return toState((await Location.requestForegroundPermissionsAsync()).status);
    },
    servicesEnabled: () => Location.hasServicesEnabledAsync(),

    async getFix({ timeoutMs, desiredAccuracyM }): Promise<LocationResult> {
      let permission = toState((await Location.getForegroundPermissionsAsync()).status);
      if (permission === 'undetermined') permission = toState((await Location.requestForegroundPermissionsAsync()).status);
      if (permission !== 'granted') return { ok: false, problem: 'permission_denied', bestEffort: null };
      if (!(await Location.hasServicesEnabledAsync())) return { ok: false, problem: 'services_off', bestEffort: null };

      const lastKnown = await Location.getLastKnownPositionAsync().catch(() => null);
      let best: LocationFix | null = lastKnown ? toFix(lastKnown, 'last_known') : null;

      // Watch for a while and keep the most accurate fix; stop early when it's good enough.
      await new Promise<void>((resolve) => {
        let sub: Location.LocationSubscription | null = null;
        let finished = false;
        const done = () => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          sub?.remove();
          resolve();
        };
        const timer = setTimeout(done, timeoutMs);
        Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 1000, distanceInterval: 0 }, (o) => {
          const fix = toFix(o, 'gps');
          if (!best || best.source !== 'gps' || (fix.accuracyM ?? Infinity) < (best.accuracyM ?? Infinity)) best = fix;
          if ((fix.accuracyM ?? Infinity) <= desiredAccuracyM) done();
        })
          .then((s) => {
            sub = s;
            if (finished) s.remove();
          })
          .catch(done);
      });

      const fix = best as LocationFix | null;
      if (!fix) return { ok: false, problem: 'no_fix', bestEffort: null };
      const warnings = warningsFor(fix);
      if (warnings.includes('mocked')) return { ok: false, problem: 'mocked', bestEffort: fix };
      return { ok: true, fix, warnings };
    },

    openSettings: () => Linking.openSettings(),
  };
}
