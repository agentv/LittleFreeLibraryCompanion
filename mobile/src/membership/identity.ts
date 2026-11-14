/**
 * DeviceIdentity built from the swappable parts (key store, attestation,
 * registry). Backend-agnostic: registration, quiet 30-day renewal and
 * status checks (docs/device-trust.md sections 4 to 6).
 */
import { DEVICE_TRUST } from '../config/limits';
import { SYNC } from '../config/sync';
import type { UUID } from '../types/models';
import type { SecretStore } from './adapters/secure-store/secrets';
import type { DeviceAttestation, DeviceIdentity, DeviceKeyStore, DeviceRegistry, DeviceTrustState } from './devices';

const ID_KEY = 'lfl.deviceId.v1';
const STATE_KEY = 'lfl.deviceState.v1';
const DAY_MS = 24 * 3600 * 1000;

export interface DeviceInfo {
  platform: 'ios' | 'android';
  model: string | null;
  appVersion: string;
}

export function createDeviceIdentity(opts: {
  keys: DeviceKeyStore;
  attestation: DeviceAttestation;
  registry: DeviceRegistry;
  secrets: SecretStore;
  info: DeviceInfo;
  newId: () => UUID;
}): DeviceIdentity {
  const listeners = new Set<(s: DeviceTrustState) => void>();
  let state: DeviceTrustState | null = null;
  let running: Promise<DeviceTrustState> | null = null;

  async function deviceId(): Promise<UUID> {
    let id = await opts.secrets.get(ID_KEY);
    if (!id) {
      id = opts.newId();
      await opts.secrets.set(ID_KEY, id);
    }
    return id;
  }

  async function load(): Promise<DeviceTrustState> {
    if (state) return state;
    const raw = await opts.secrets.get(STATE_KEY);
    const id = await deviceId();
    try {
      const parsed = raw ? (JSON.parse(raw) as DeviceTrustState) : null;
      state = parsed && parsed.deviceId === id ? parsed : null;
    } catch {
      state = null;
    }
    state ??= { deviceId: id, registered: false, status: 'unregistered', attestation: null, trustExpiresAt: null, lastCheckedAt: null };
    return state;
  }

  async function save(next: DeviceTrustState) {
    state = next;
    await opts.secrets.set(STATE_KEY, JSON.stringify(next));
    listeners.forEach((l) => l(next));
  }

  async function attestationFor(challenge: string): Promise<string | null> {
    try {
      return (await opts.attestation.isSupported()) ? await opts.attestation.attest(challenge) : null;
    } catch {
      return null; // the server records "unavailable"; an admin approves the phone
    }
  }

  async function run(force: boolean): Promise<DeviceTrustState> {
    const current = await load();
    const now = Date.now();

    if (!current.registered) {
      const publicKey = await opts.keys.ensureKeyPair();
      const challenge = await opts.registry.getChallenge();
      const device = await opts.registry.register({
        deviceId: current.deviceId,
        publicKey,
        challenge,
        signedChallenge: await opts.keys.sign(challenge),
        attestationToken: await attestationFor(challenge),
        ...opts.info,
      });
      const next: DeviceTrustState = {
        deviceId: current.deviceId,
        registered: true,
        status: device.status,
        attestation: device.attestation,
        trustExpiresAt: device.trustExpiresAt,
        lastCheckedAt: new Date(now).toISOString(),
      };
      await save(next);
      return next;
    }

    if (current.status === 'revoked') return current;

    const expires = current.trustExpiresAt ? Date.parse(current.trustExpiresAt) : null;
    const renewDue = current.status === 'trusted' && expires !== null && expires - now < DEVICE_TRUST.RENEW_BEFORE_DAYS * DAY_MS;
    if (renewDue) {
      const challenge = await opts.registry.getChallenge();
      const device = await opts.registry.reverify({
        challenge,
        signedChallenge: await opts.keys.sign(challenge),
        attestationToken: await attestationFor(challenge),
        appVersion: opts.info.appVersion,
      });
      const next: DeviceTrustState = {
        ...current,
        status: device.status,
        attestation: device.attestation,
        trustExpiresAt: device.trustExpiresAt,
        lastCheckedAt: new Date(now).toISOString(),
      };
      await save(next);
      return next;
    }

    const lastChecked = current.lastCheckedAt ? Date.parse(current.lastCheckedAt) : 0;
    // A pending phone is checked every time, so approval shows up quickly.
    if (force || current.status === 'pending' || now - lastChecked > SYNC.TRUST_CHECK_MS) {
      const seen = await opts.registry.status(current.deviceId);
      const next: DeviceTrustState = seen
        ? { ...current, status: seen.status, trustExpiresAt: seen.trustExpiresAt, lastCheckedAt: new Date(now).toISOString() }
        : // The server doesn't know this phone (database restored, or another member's): register again.
          { ...current, registered: false, status: 'unregistered', lastCheckedAt: new Date(now).toISOString() };
      await save(next);
      return next.registered ? next : run(false);
    }
    return current;
  }

  return {
    getDeviceId: deviceId,
    getState: load,
    ensureTrusted(options) {
      if (!running) running = run(options?.force ?? false).finally(() => (running = null));
      return running;
    },
    async markRevoked() {
      const current = await load();
      await save({ ...current, status: 'revoked' });
    },
    async markExpired() {
      const current = await load();
      // Renewal runs on the next ensureTrusted.
      await save({ ...current, trustExpiresAt: new Date(0).toISOString() });
    },
    signRequest: (canonical) => opts.keys.sign(canonical),
    async reset() {
      await opts.keys.reset();
      await opts.secrets.delete(ID_KEY);
      await opts.secrets.delete(STATE_KEY);
      state = null;
    },
    onStateChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
