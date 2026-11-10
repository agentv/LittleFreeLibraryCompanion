/**
 * Device verification and authentication (docs/device-trust.md).
 * Part of membership: membership answers "who is this, and on which
 * trusted device?". Vendor code (expo-secure-store, App Attest,
 * Play Integrity) lives in src/membership/adapters/<vendor>/.
 */
import type { Device, DeviceStatus, UUID } from '../types/models';

/** Keys kept in the phone's secure hardware. The private key never leaves the phone. */
export interface DeviceKeyStore {
  /** Create the key pair on first run; returns the public key. */
  ensureKeyPair(): Promise<string>;
  sign(payload: string): Promise<string>;
  /** Wipe keys (sign-out on a shared or lost phone). */
  reset(): Promise<void>;
}

/** Proof from Apple (App Attest) or Google (Play Integrity) that this is our real app on a real phone. */
export interface DeviceAttestation {
  isSupported(): Promise<boolean>;
  /** Produce a token for the server to check, bound to the server's challenge. */
  attest(challenge: string): Promise<string>;
}

/** Talks to the backend about devices. One implementation per backend. */
export interface DeviceRegistry {
  /** Ask the server for a one-time challenge to sign/attest. */
  getChallenge(): Promise<string>;
  /**
   * Register this device for the signed-in member: public key, signed
   * challenge and attestation token. Returns the device as the server sees it.
   */
  register(input: {
    deviceId: UUID;
    publicKey: string;
    signedChallenge: string;
    attestationToken: string | null;
    platform: 'ios' | 'android';
    model: string | null;
    appVersion: string;
  }): Promise<Device>;
  /** Current status of this device (trusted, pending, revoked). */
  status(deviceId: UUID): Promise<DeviceStatus>;
  /** The member's own devices, so they can revoke a lost phone. */
  listMine(): Promise<Device[]>;
  revoke(deviceId: UUID): Promise<void>;
}

/** What the rest of the app uses. */
export interface DeviceIdentity {
  /** Stable id for this install, created on first run. */
  getDeviceId(): Promise<UUID>;
  /** Register if needed and report whether this device may sync. */
  ensureRegistered(): Promise<DeviceStatus>;
  /** Signature over a request, used by the server subsystem. */
  signRequest(canonical: string): Promise<string>;
}
