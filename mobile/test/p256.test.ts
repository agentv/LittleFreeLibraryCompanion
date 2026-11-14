// The device key must produce exactly what the server's node:crypto checks
// accept (server/src/devices/crypto.ts): base64 SPKI P-256, base64 DER signatures.
import { createPublicKey, randomBytes, verify } from 'node:crypto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bytesToBase64, P256_SEED_BYTES, publicKeySpkiBase64, secretKeyFromSeed, signBase64Der } from '../src/membership/adapters/secure-store/p256.ts';
import { canonicalRequest, sha256Hex } from '../src/server/signing.ts';

test('public key parses as a P-256 SPKI and signatures verify', () => {
  const sk = secretKeyFromSeed(new Uint8Array(randomBytes(P256_SEED_BYTES)));
  const spki = publicKeySpkiBase64(sk);
  const key = createPublicKey({ key: Buffer.from(spki, 'base64'), format: 'der', type: 'spki' });
  assert.equal(key.asymmetricKeyType, 'ec');
  assert.equal(key.asymmetricKeyDetails?.namedCurve, 'prime256v1');

  const body = JSON.stringify({ changes: { visits: [] } });
  const message = canonicalRequest('post', '/v1/sync/push', sha256Hex(body), '2026-11-14T12:00:00.000Z');
  assert.equal(message.split('\n')[0], 'POST');
  const sig = signBase64Der(sk, message);
  assert.ok(verify('sha256', Buffer.from(message), key, Buffer.from(sig, 'base64')));
  assert.ok(!verify('sha256', Buffer.from(message + 'x'), key, Buffer.from(sig, 'base64')));
});

test('base64 matches Node', () => {
  for (const n of [0, 1, 2, 3, 4, 31, 32, 33]) {
    const b = new Uint8Array(randomBytes(n));
    assert.equal(bytesToBase64(b), Buffer.from(b).toString('base64'));
  }
});

test('body hash of an empty body is the SHA-256 of ""', () => {
  assert.equal(sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});
