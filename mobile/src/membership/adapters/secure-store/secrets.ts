/** Small secrets (tokens, device key, device id) in Keychain / Keystore via expo-secure-store. */
import * as SecureStore from 'expo-secure-store';

export interface SecretStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

const OPTIONS: SecureStore.SecureStoreOptions = {
  // Never restored to another phone from a backup: the key belongs to this device.
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

export function createSecureSecretStore(): SecretStore {
  return {
    get: (key) => SecureStore.getItemAsync(key, OPTIONS),
    set: (key, value) => SecureStore.setItemAsync(key, value, OPTIONS),
    delete: (key) => SecureStore.deleteItemAsync(key, OPTIONS),
  };
}

/** In memory only; for demo mode and tests. */
export function createMemorySecretStore(): SecretStore {
  const map = new Map<string, string>();
  return {
    get: async (key) => map.get(key) ?? null,
    set: async (key, value) => void map.set(key, value),
    delete: async (key) => void map.delete(key),
  };
}
