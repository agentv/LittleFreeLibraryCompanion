/** React access to the services, plus live hooks for session, sync status and stored data. */
import * as Network from 'expo-network';
import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { SYNC } from '../config/sync';
import type { DeviceTrustState, Session } from '../membership';
import type { LocalStore, SyncStatus } from '../sync';
import { createServices, type Services } from './index';

const ServicesContext = createContext<Services | null>(null);

export function ServicesProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const [services, setServices] = useState<Services | null>(null);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    createServices().then(setServices, setError);
  }, []);
  if (error) throw error;
  if (!services) return <>{fallback}</>;
  return (
    <ServicesContext.Provider value={services}>
      <AutoSync services={services} />
      {children}
    </ServicesContext.Provider>
  );
}

export function useServices(): Services {
  const s = useContext(ServicesContext);
  if (!s) throw new Error('useServices outside ServicesProvider');
  return s;
}

/** Runs sync on start, every minute, when the app comes back, and when the network returns; backs off after errors. */
function AutoSync({ services }: { services: Services }) {
  useEffect(() => {
    let backoff: number = SYNC.BACKOFF_START_MS;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const kick = () => {
      if (stopped) return;
      services.sync.syncNow().then(
        () => {
          backoff = SYNC.BACKOFF_START_MS;
        },
        () => {
          if (retry) clearTimeout(retry);
          retry = setTimeout(kick, backoff);
          backoff = Math.min(backoff * 2, SYNC.BACKOFF_MAX_MS);
        },
      );
    };
    kick();
    const interval = setInterval(kick, SYNC.INTERVAL_MS);
    const app = AppState.addEventListener('change', (s) => s === 'active' && kick());
    const net = Network.addNetworkStateListener((s) => s.isInternetReachable !== false && s.isConnected && kick());
    const auth = services.auth.onSessionChange((s) => s && kick());
    return () => {
      stopped = true;
      clearInterval(interval);
      if (retry) clearTimeout(retry);
      app.remove();
      net.remove();
      auth();
    };
  }, [services]);
  return null;
}

/** undefined while loading, null when signed out. */
export function useSession(): Session | null | undefined {
  const { auth } = useServices();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    auth.getSession().then((s) => live && setSession(s));
    const off = auth.onSessionChange((s) => setSession(s));
    return () => {
      live = false;
      off();
    };
  }, [auth]);
  return session;
}

export function useSyncStatus(): SyncStatus {
  const { sync } = useServices();
  const [status, setStatus] = useState(sync.getStatus());
  useEffect(() => sync.subscribe(setStatus), [sync]);
  return status;
}

export function useDeviceState(): DeviceTrustState | null {
  const { device } = useServices();
  const [state, setState] = useState<DeviceTrustState | null>(null);
  useEffect(() => {
    let live = true;
    device.getState().then((s) => live && setState(s));
    const off = device.onStateChange(setState);
    return () => {
      live = false;
      off();
    };
  }, [device]);
  return state;
}

/**
 * Read from the local store and re-render when it changes. The selector
 * runs on every store change; keep it cheap.
 */
export function useStore<T>(select: (store: LocalStore) => T): T {
  const { sync } = useServices();
  const store = sync.store;
  const version = useRef(0);
  const subscribe = useCallback(
    (cb: () => void) =>
      store.subscribe(() => {
        version.current++;
        cb();
      }),
    [store],
  );
  useSyncExternalStore(subscribe, () => version.current);
  return select(store);
}

/** Is the phone online right now (for the "No signal right now" banner)? */
export function useOnline(): boolean {
  const state = Network.useNetworkState();
  return state.isConnected !== false && state.isInternetReachable !== false;
}
