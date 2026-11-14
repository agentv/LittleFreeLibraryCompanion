/**
 * DeviceKeyStore for the first build (decided 2026-11-14): the P-256 secret
 * is kept in the phone's secure storage and used in app code, so the app
 * runs in Expo Go. Replace with a Secure Enclave / StrongBox key in a
 * development build, together with App Attest / Play Integrity.
 */
import { getRandomBytes } from 'expo-crypto';
import type { DeviceKeyStore } from '../../devices';
import { P256_SEED_BYTES, publicKeySpkiBase64, secretKeyFromSeed, signBase64Der } from './p256';
import type { SecretStore } from './secrets';

const KEY = 'lfl.deviceKey.v1';

export function createSoftwareKeyStore(secrets: SecretStore): DeviceKeyStore {
  let cached: string | null = null;

  async function secret(create: boolean): Promise<string | null> {
    if (cached) return cached;
    cached = await secrets.get(KEY);
    if (!cached && create) {
      cached = secretKeyFromSeed(getRandomBytes(P256_SEED_BYTES));
      await secrets.set(KEY, cached);
    }
    return cached;
  }

  return {
    async ensureKeyPair() {
      return publicKeySpkiBase64((await secret(true))!);
    },
    async sign(payload) {
      const sk = await secret(false);
      if (!sk) throw new Error('No device key yet.');
      return signBase64Der(sk, payload);
    },
    async reset() {
      cached = null;
      await secrets.delete(KEY);
    },
  };
}
