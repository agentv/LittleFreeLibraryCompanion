// Request signing (docs/device-trust.md section 7, backend R29).
//
// Key: ECDSA P-256 (the only type iOS Secure Enclave holds), public key sent as
// base64 SPKI DER. Signature: ECDSA with SHA-256, base64 DER.
// Signed string:  METHOD \n PATH_WITH_QUERY \n SHA256_HEX(body) \n TIMESTAMP
import { createHash, createPublicKey, randomBytes, verify, type KeyObject } from 'node:crypto';

export function sha256Hex(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

export function canonicalRequest(method: string, pathWithQuery: string, body: string, timestamp: string): string {
  return [method.toUpperCase(), pathWithQuery, sha256Hex(body), timestamp].join('\n');
}

export function parsePublicKey(spkiBase64: string): KeyObject | null {
  try {
    const key = createPublicKey({ key: Buffer.from(spkiBase64, 'base64'), format: 'der', type: 'spki' });
    if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') return null;
    return key;
  } catch {
    return null;
  }
}

export function verifySignature(publicKeySpkiBase64: string, message: string, signatureBase64: string): boolean {
  const key = parsePublicKey(publicKeySpkiBase64);
  if (!key) return false;
  try {
    return verify('sha256', Buffer.from(message), key, Buffer.from(signatureBase64, 'base64'));
  } catch {
    return false;
  }
}

export function newChallenge(): string {
  return randomBytes(32).toString('base64url');
}
