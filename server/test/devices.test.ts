import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { canonicalRequest } from '../src/devices/crypto.js';
import { createHarness, newKeyPair, signWith, type Harness } from './helpers.js';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => h?.close());

async function register(member: Awaited<ReturnType<Harness['member']>>, keys = newKeyPair(), deviceId = randomUUID()) {
  const ch = await h.call('POST', '/v1/devices/challenge', {}, { member });
  expect(ch.status).toBe(200);
  const res = await h.call(
    'POST',
    '/v1/devices/register',
    {
      deviceId,
      publicKey: keys.publicKey,
      platform: 'ios',
      model: 'iPhone 15',
      appVersion: '1.0.0',
      challenge: ch.json.challenge,
      challengeSignature: signWith(keys.privateKey, ch.json.challenge),
      attestationToken: 'token',
    },
    { member },
  );
  return { res, keys, deviceId };
}

describe('device registration', () => {
  it('trusts a device straight away when attestation passes', async () => {
    h.attestation.result = 'passed';
    const m = await h.member();
    const { res } = await register(m);
    expect(res.status).toBe(200);
    expect(res.json.device.status).toBe('trusted');
    expect(res.json.device.trustExpiresAt).toBeTruthy();
  });

  it('keeps a device pending when attestation is unavailable or fails', async () => {
    const m = await h.member();
    h.attestation.result = 'unavailable';
    expect((await register(m)).res.json.device.status).toBe('pending');
    h.attestation.result = 'failed';
    expect((await register(m)).res.json.device.status).toBe('pending');
    h.attestation.result = 'passed';
  });

  it('refuses a challenge signed with another key, and a reused challenge', async () => {
    const m = await h.member();
    const keys = newKeyPair();
    const other = newKeyPair();
    const ch = await h.call('POST', '/v1/devices/challenge', {}, { member: m });
    const body = {
      deviceId: randomUUID(), publicKey: keys.publicKey, platform: 'ios', appVersion: '1', challenge: ch.json.challenge,
      challengeSignature: signWith(other.privateKey, ch.json.challenge), attestationToken: null,
    };
    expect((await h.call('POST', '/v1/devices/register', body, { member: m })).status).toBe(401);
    const good = { ...body, challengeSignature: signWith(keys.privateKey, ch.json.challenge) };
    expect((await h.call('POST', '/v1/devices/register', good, { member: m })).status).toBe(200);
    const again = { ...good, deviceId: randomUUID() };
    expect((await h.call('POST', '/v1/devices/register', again, { member: m })).status).toBe(400);
  });

  it('does not let a second member register the same phone', async () => {
    const a = await h.member();
    const b = await h.member();
    const first = await register(a);
    const second = await register(b, first.keys, first.deviceId);
    expect(second.res.status).toBe(403);
    expect(second.res.json.error.code).toBe('forbidden');
  });
});

describe('signed requests', () => {
  it('accepts a correctly signed request from a trusted device', async () => {
    const m = await h.member();
    const d = await h.device(m);
    expect((await h.call('GET', '/v1/sync/pull', undefined, { member: m, device: d })).status).toBe(200);
  });

  it('rejects unsigned, stale, tampered and wrong-member requests', async () => {
    const m = await h.member();
    const d = await h.device(m);
    expect((await h.call('GET', '/v1/sync/pull', undefined, { member: m })).status).toBe(401);
    const old = new Date(h.clock.now.getTime() - 6 * 60 * 1000).toISOString();
    expect((await h.call('GET', '/v1/sync/pull', undefined, { member: m, device: d, timestamp: old })).status).toBe(401);

    // Signature made for a different body.
    const ts = h.clock.now.toISOString();
    const sig = signWith(d.privateKey, canonicalRequest('POST', '/v1/sync/push', '{"changes":{}}', ts));
    const res = await h.app.request('/v1/sync/push', {
      method: 'POST',
      headers: { authorization: `Bearer ${m.token}`, 'x-device-id': d.id, 'x-timestamp': ts, 'x-signature': sig, 'content-type': 'application/json' },
      body: '{"changes":{"libraries":[]}}',
    });
    expect(res.status).toBe(401);

    const other = await h.member();
    const r = await h.call('GET', '/v1/sync/pull', undefined, { member: other, device: d });
    expect(r.json.error.code).toBe('device_untrusted');
  });

  it('reports pending, expired and revoked devices with their reason', async () => {
    const m = await h.member();
    const pending = await h.device(m, { status: 'pending' });
    let r = await h.call('GET', '/v1/sync/pull', undefined, { member: m, device: pending });
    expect(r.json.error).toMatchObject({ code: 'device_untrusted', deviceReason: 'pending_approval' });

    const expired = await h.device(m, { expiresInDays: -1 });
    r = await h.call('GET', '/v1/sync/pull', undefined, { member: m, device: expired });
    expect(r.json.error).toMatchObject({ code: 'device_untrusted', deviceReason: 'expired' });

    const revoked = await h.device(m, { status: 'revoked' });
    r = await h.call('GET', '/v1/sync/pull', undefined, { member: m, device: revoked });
    expect(r.json.error.code).toBe('device_revoked');
  });
});

describe('renewal', () => {
  it('renews an expired device for another 30 days when attestation passes', async () => {
    const m = await h.member();
    const d = await h.device(m, { expiresInDays: -2 });
    const ch = await h.call('POST', '/v1/devices/challenge', {}, { member: m });
    const r = await h.call(
      'POST',
      '/v1/devices/verify',
      { challenge: ch.json.challenge, challengeSignature: signWith(d.privateKey, ch.json.challenge), attestationToken: 't', appVersion: '1.0.1' },
      { member: m, device: d },
    );
    expect(r.status).toBe(200);
    expect(r.json.device.status).toBe('trusted');
    expect(new Date(r.json.device.trustExpiresAt).getTime()).toBeGreaterThan(h.clock.now.getTime() + 29 * 86400000);
    expect((await h.call('GET', '/v1/sync/pull', undefined, { member: m, device: d })).status).toBe(200);
  });

  it('keeps an admin-approved device trusted when attestation is still unavailable', async () => {
    const m = await h.member();
    const d = await h.device(m, { expiresInDays: 1 });
    await h.owner.query(`update devices set attestation = 'unavailable' where id = $1`, [d.id]);
    h.attestation.result = 'unavailable';
    const ch = await h.call('POST', '/v1/devices/challenge', {}, { member: m });
    const r = await h.call(
      'POST',
      '/v1/devices/verify',
      { challenge: ch.json.challenge, challengeSignature: signWith(d.privateKey, ch.json.challenge), attestationToken: null, appVersion: '1' },
      { member: m, device: d },
    );
    h.attestation.result = 'passed';
    expect(r.json.device.status).toBe('trusted');
  });
});

describe('token refresh is tied to the device', () => {
  it('refreshes only for the member’s own, non-removed device', async () => {
    const m = await h.member();
    const d = await h.device(m);
    h.auth.sessions.set('rt-1', m.id);
    const ok = await h.call('POST', '/v1/auth/refresh', { refreshToken: 'rt-1' }, { device: d });
    expect(ok.status).toBe(200);
    expect(ok.json.refreshToken).toBe('new-refresh');

    const other = await h.member();
    h.auth.sessions.set('rt-2', other.id);
    expect((await h.call('POST', '/v1/auth/refresh', { refreshToken: 'rt-2' }, { device: d })).status).toBe(401);

    await h.owner.query(`update devices set status = 'revoked' where id = $1`, [d.id]);
    const revoked = await h.call('POST', '/v1/auth/refresh', { refreshToken: 'rt-1' }, { device: d });
    expect(revoked.json.error.code).toBe('device_revoked');
  });
});
