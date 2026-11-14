/**
 * The one place the app picks its adapters (docs/architecture.md rule 3).
 * Demo mode swaps the backend-facing adapters for on-phone ones; screens
 * can't tell the difference.
 */
import Constants from 'expo-constants';
import { randomUUID } from 'expo-crypto';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { ENV } from '../config/env';

import type { LocationProvider } from '../location';
import { createExpoLocationProvider } from '../location/adapters/expo-location/provider';
import type { DeviceIdentity, DeviceRegistry, DeviceTrustState, Member, MemberDirectory, AuthProvider } from '../membership';
import { createUnavailableAttestation } from '../membership/adapters/attestation/unavailable';
import { createDemoMembership } from '../membership/adapters/demo';
import { createNodeMemberDirectory } from '../membership/adapters/node-service/directory';
import { createNodeAuth } from '../membership/adapters/node-service/auth';
import { createNodeDeviceRegistry, RegistryError } from '../membership/adapters/node-service/registry';
import { createSoftwareKeyStore } from '../membership/adapters/secure-store/keyStore';
import { createSecureSecretStore } from '../membership/adapters/secure-store/secrets';
import { createDeviceIdentity } from '../membership/identity';
import { createServerClient, type CredentialsProvider, type ServerClient } from '../server';
import { canonicalRequest } from '../server';
import {
  createLocalStore,
  createSyncEngine,
  SyncError,
  type MediaStore,
  type RemoteSync,
  type SyncEngine,
  type SyncErrorCode,
  type SyncGate,
} from '../sync';
import { createDemoMediaStore, createDemoRemoteSync } from '../sync/adapters/demo';
import { createNodeMediaStore } from '../sync/adapters/node-service/media';
import { createNodeRemoteSync } from '../sync/adapters/node-service/remote';
import { openSqlitePersistence } from '../sync/adapters/sqlite/persistence';
import type { UUID } from '../types/models';

export interface Services {
  demo: boolean;
  auth: AuthProvider;
  device: DeviceIdentity;
  devices: DeviceRegistry;
  directory: MemberDirectory;
  sync: SyncEngine;
  location: LocationProvider;
  newId: () => UUID;
  /** Signs out of the session only, keeping this phone's key and unsent work (e.g. after "sign in again"). */
  endSession(): Promise<void>;
  /** Full sign-out: wipes tokens, device key and the local database (docs/device-trust.md section 10). */
  signOutAndWipe(): Promise<void>;
}

const FALLBACK_CENTER = { latitude: 39.7817, longitude: -89.6501 };

export async function createServices(): Promise<Services> {
  const secrets = createSecureSecretStore();
  const location = createExpoLocationProvider();
  const newId = () => randomUUID();
  const store = await createLocalStore(await openSqlitePersistence(ENV.demoMode ? 'lfl-demo.db' : 'lfl.db'));

  let auth: AuthProvider & { refresh?: () => Promise<boolean> };
  let device: DeviceIdentity;
  let devices: DeviceRegistry;
  let directory: MemberDirectory;
  let remote: RemoteSync;
  let media: MediaStore;

  if (ENV.demoMode) {
    const demoDeviceId = (await secrets.get('lfl.demoDeviceId')) ?? newId();
    await secrets.set('lfl.demoDeviceId', demoDeviceId);
    const demo = createDemoMembership({ secrets, signUpUrl: ENV.signUpUrl, deviceId: demoDeviceId });
    ({ auth, device, devices, directory } = demo);
    let me: UUID = (await auth.getSession())?.member.id ?? '';
    auth.onSessionChange((s) => (me = s?.member.id ?? ''));
    remote = createDemoRemoteSync({
      me: () => me,
      center: async () => {
        const r = await location.getFix({ timeoutMs: 4000, desiredAccuracyM: 100 }).catch(() => null);
        if (r?.ok) return r.fix;
        return r?.bestEffort ?? FALLBACK_CENTER;
      },
    });
    media = createDemoMediaStore();
  } else {
    let client: ServerClient;
    const getClient = () => client;
    const nodeAuth = createNodeAuth({ client: getClient, secrets, signUpUrl: ENV.signUpUrl });
    devices = createNodeDeviceRegistry(getClient);
    device = createDeviceIdentity({
      keys: createSoftwareKeyStore(secrets),
      attestation: createUnavailableAttestation(),
      registry: devices,
      secrets,
      newId,
      info: {
        platform: Platform.OS === 'android' ? 'android' : 'ios',
        model: Device.modelName ?? null,
        appVersion: Constants.expoConfig?.version ?? '0.0.0',
      },
    });
    const credentials: CredentialsProvider = {
      getAccessToken: () => nodeAuth.accessToken(),
      async signRequest(req) {
        const state = await device.getState();
        if (!state.registered) return null;
        const signature = await device.signRequest(canonicalRequest(req.method, req.path, req.bodyHash, req.timestamp));
        return { deviceId: state.deviceId, signature };
      },
      onUnauthorized: () => nodeAuth.refresh(),
    };
    client = createServerClient({ baseUrl: ENV.apiUrl, apiVersion: ENV.apiVersion, timeoutMs: ENV.requestTimeoutMs }, credentials);
    auth = nodeAuth;
    directory = createNodeMemberDirectory(getClient);
    remote = createNodeRemoteSync(getClient);
    media = createNodeMediaStore(getClient);
  }

  const gate: SyncGate = async () => {
    if (!(await auth.getSession())) return { push: false, pull: false, upload: false, reason: 'Signed out.' };
    let member: Member | null;
    let state: DeviceTrustState;
    try {
      member = await auth.refreshMember();
      state = await device.ensureTrusted();
    } catch (err) {
      if (err instanceof RegistryError) throw new SyncError(err.code as SyncErrorCode, err.message);
      throw err;
    }
    if (!member) return { push: false, pull: false, upload: false, reason: 'Signed out.' };
    if (state.status === 'revoked') {
      return { push: false, pull: false, upload: false, reason: 'This phone was removed from your account. Sign out and sign in again to register it.' };
    }
    const active = member.status === 'active';
    const trusted = state.status === 'trusted';
    const reason = !active
      ? member.status === 'pending'
        ? 'Your account is waiting for an admin to approve it. You can look around, but check-ins wait until then.'
        : 'Your account is suspended, so new check-ins stay on this phone.'
      : !trusted
        ? 'This phone is waiting for an admin to approve it. You can see the libraries, and check-ins upload now and wait for that approval.'
        : null;
    // Any registered, non-removed phone may pull (Q11), so a pending phone still sees the libraries.
    return { push: active, pull: true, upload: active && trusted, reason };
  };

  const services: Services = {
    demo: ENV.demoMode,
    auth,
    device,
    devices,
    directory,
    location,
    newId,
    sync: null as unknown as SyncEngine,
    async endSession() {
      await auth.signOut();
    },
    async signOutAndWipe() {
      await auth.signOut();
      await device.reset();
      await store.clear();
    },
  };

  services.sync = createSyncEngine({
    store,
    remote,
    media,
    gate,
    onError: (err) => {
      if (err.code === 'unauthorized') void services.endSession();
      else if (err.code === 'device_revoked') void device.markRevoked();
      else if (err.code === 'device_untrusted' && err.deviceReason === 'expired') void device.markExpired();
    },
  });
  return services;
}

