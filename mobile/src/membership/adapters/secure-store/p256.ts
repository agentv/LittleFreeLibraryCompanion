/**
 * P-256 key handling in app code (pure functions, no Expo imports, so they
 * can be tested in Node). The backend expects the public key as base64 SPKI
 * DER and signatures as base64 DER over SHA-256 of the payload.
 */
import { p256 } from '@noble/curves/nist.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';

/** DER prefix of an SPKI for an uncompressed P-256 point (id-ecPublicKey, prime256v1). */
const SPKI_PREFIX = hexToBytes('3059301306072a8648ce3d020106082a8648ce3d030107034200');

export const P256_SEED_BYTES: number = p256.lengths.seed ?? 48;

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2]! : 0;
    const n = (a << 16) | (b << 8) | c;
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!;
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63]! : '=';
    out += i + 2 < bytes.length ? B64[n & 63]! : '=';
  }
  return out;
}

/** Secret key (hex) from random seed bytes. */
export function secretKeyFromSeed(seed: Uint8Array): string {
  return bytesToHex(p256.utils.randomSecretKey(seed));
}

export function publicKeySpkiBase64(secretKeyHex: string): string {
  const point = p256.getPublicKey(hexToBytes(secretKeyHex), false);
  const spki = new Uint8Array(SPKI_PREFIX.length + point.length);
  spki.set(SPKI_PREFIX, 0);
  spki.set(point, SPKI_PREFIX.length);
  return bytesToBase64(spki);
}

export function signBase64Der(secretKeyHex: string, payload: string): string {
  const sig = p256.sign(utf8ToBytes(payload), hexToBytes(secretKeyHex), { prehash: true, format: 'der' });
  return bytesToBase64(sig);
}
