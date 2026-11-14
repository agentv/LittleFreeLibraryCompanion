/** Ask for the phone's position once (or on demand). Never blocks the screen. */
import { useCallback, useEffect, useState } from 'react';
import { LOCATION } from '../config/limits';
import type { LocationResult } from '../location';
import { useServices } from './context';

export function usePosition(options: { auto?: boolean; timeoutMs?: number } = {}) {
  const { location } = useServices();
  const [result, setResult] = useState<LocationResult | null>(null);
  const [busy, setBusy] = useState(options.auto !== false);
  const timeoutMs = options.timeoutMs ?? LOCATION.FIX_TIMEOUT_MS;

  const run = useCallback(
    (): Promise<LocationResult> =>
      location
        .getFix({ timeoutMs, desiredAccuracyM: LOCATION.DESIRED_ACCURACY_M })
        .catch((): LocationResult => ({ ok: false, problem: 'no_fix', bestEffort: null }))
        .then((r) => {
          setResult(r);
          setBusy(false);
          return r;
        }),
    [location, timeoutMs],
  );

  const refresh = useCallback(() => {
    setBusy(true);
    return run();
  }, [run]);

  useEffect(() => {
    if (options.auto !== false) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fix = result ? (result.ok ? result.fix : result.bestEffort) : null;
  return { result, fix, busy, refresh };
}
