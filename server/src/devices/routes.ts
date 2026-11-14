// Device registration and renewal (backend R27, R28, R30a; docs/device-trust.md).
import { Hono } from 'hono';
import { z } from 'zod';
import { withSession, type SessionContext } from '../db/session.js';
import type { DbClient } from '../db/pool.js';
import type { Deps } from '../deps.js';
import { parseJson, readRawBody, requireDevice, requireMember, type Vars } from '../http/context.js';
import { ApiError } from '../http/errors.js';
import { LIMITS } from '../limits.js';
import type { AttestationResult } from './attestation.js';
import { newChallenge, parsePublicKey, verifySignature } from './crypto.js';

const uuid = z.string().uuid();

const registerBody = z.object({
  deviceId: uuid,
  publicKey: z.string().min(1),
  platform: z.enum(['ios', 'android']),
  model: z.string().max(200).nullable().optional(),
  appVersion: z.string().min(1).max(50),
  challenge: z.string().min(1),
  /** Signature over the challenge string with the device key (base64 DER). */
  challengeSignature: z.string().min(1),
  /** App Attest attestation object or Play Integrity token; null if unavailable. */
  attestationToken: z.string().nullable(),
});

const verifyBody = registerBody.pick({ challenge: true, challengeSignature: true, attestationToken: true, appVersion: true });

export interface DeviceOut {
  id: string;
  memberId: string;
  platform: 'ios' | 'android';
  model: string | null;
  appVersion: string;
  attestation: AttestationResult;
  status: 'pending' | 'trusted' | 'revoked';
  registeredAt: string;
  lastVerifiedAt: string | null;
  trustExpiresAt: string | null;
  lastSeenAt: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
}

export const DEVICE_COLUMNS = `id, member_id as "memberId", platform, model, app_version as "appVersion", attestation, status,
  registered_at as "registeredAt", last_verified_at as "lastVerifiedAt", trust_expires_at as "trustExpiresAt",
  last_seen_at as "lastSeenAt", revoked_at as "revokedAt", revoked_by as "revokedBy"`;

export function trustExpiry(now: Date): string {
  return new Date(now.getTime() + LIMITS.deviceTrustDays * 24 * 3600 * 1000).toISOString();
}

async function useChallenge(db: DbClient, memberId: string, challenge: string, now: Date): Promise<void> {
  const r = await db.query(
    `update device_challenges set used_at = $3
     where challenge = $1 and member_id = $2 and used_at is null and expires_at > $3 returning challenge`,
    [challenge, memberId, now.toISOString()],
  );
  if (!r.rowCount) throw new ApiError('bad_request', 'Challenge is unknown, used or expired. Ask for a new one.');
}

export function deviceRoutes(deps: Deps) {
  const app = new Hono<{ Variables: Vars }>();
  app.use('*', requireMember(deps));

  app.post('/challenge', async (c) => {
    const member = c.get('member');
    const challenge = newChallenge();
    const expiresAt = new Date(deps.now().getTime() + LIMITS.challengeTtlMs).toISOString();
    await withSession(deps.pool, { memberId: member.id }, (db) =>
      db.query('insert into device_challenges (challenge, member_id, expires_at) values ($1, $2, $3)', [challenge, member.id, expiresAt]),
    );
    return c.json({ challenge, expiresAt });
  });

  // Not request-signed: the device isn't known yet. It proves it holds the key
  // by signing the one-time challenge instead.
  app.post('/register', async (c) => {
    await readRawBody(c);
    const body = registerBody.parse(parseJson(c));
    const member = c.get('member');
    const now = deps.now();
    if (!parsePublicKey(body.publicKey)) throw new ApiError('bad_request', 'publicKey must be a base64 SPKI P-256 key.');
    if (!verifySignature(body.publicKey, body.challenge, body.challengeSignature)) {
      throw new ApiError('unauthorized', 'Challenge signature is invalid.');
    }
    const attestation = await deps.attestation.verify({
      platform: body.platform,
      token: body.attestationToken,
      challenge: body.challenge,
      deviceId: body.deviceId,
      publicKey: body.publicKey,
    });
    const trusted = attestation === 'passed';
    const ctx: SessionContext = { memberId: member.id, deviceId: body.deviceId };
    const device = await withSession(deps.pool, ctx, async (db) => {
      await useChallenge(db, member.id, body.challenge, now);
      const existing = await db.query<{ public_key: string; status: string }>('select public_key, status from devices where id = $1', [body.deviceId]);
      const row = existing.rows[0];
      if (row) {
        if (row.status === 'revoked') throw new ApiError('device_revoked', 'This device was removed. Reinstall the app to register again.');
        if (row.public_key !== body.publicKey) throw new ApiError('conflict', 'This device id is registered with a different key.');
        const r = await db.query<DeviceOut>(
          `update devices set platform = $2, model = $3, app_version = $4, attestation = $5,
             status = case when $6 then 'trusted' else status end,
             last_verified_at = case when $6 then $7::timestamptz else last_verified_at end,
             trust_expires_at = case when $6 then $8::timestamptz else trust_expires_at end
           where id = $1 returning ${DEVICE_COLUMNS}`,
          [body.deviceId, body.platform, body.model ?? null, body.appVersion, attestation, trusted, now.toISOString(), trustExpiry(now)],
        );
        return r.rows[0]!;
      }
      try {
        const r = await db.query<DeviceOut>(
          `insert into devices (id, member_id, public_key, platform, model, app_version, attestation, status, last_verified_at, trust_expires_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning ${DEVICE_COLUMNS}`,
          [
            body.deviceId, member.id, body.publicKey, body.platform, body.model ?? null, body.appVersion, attestation,
            trusted ? 'trusted' : 'pending', trusted ? now.toISOString() : null, trusted ? trustExpiry(now) : null,
          ],
        );
        return r.rows[0]!;
      } catch (err) {
        // Same id already belongs to another member (invisible under RLS).
        if ((err as { code?: string }).code === '23505') {
          throw new ApiError('forbidden', 'This device is registered to another member. Shared phones are not supported.');
        }
        throw err;
      }
    });
    return c.json({ device });
  });

  // Renewal before or after the 30-day expiry (R30a). Signed by the device.
  app.post('/verify', requireDevice(deps, 'registered'), async (c) => {
    const body = verifyBody.parse(parseJson(c));
    const member = c.get('member');
    const device = c.get('device');
    const now = deps.now();
    if (!verifySignature(device.public_key, body.challenge, body.challengeSignature)) {
      throw new ApiError('unauthorized', 'Challenge signature is invalid.');
    }
    const attestation = await deps.attestation.verify({
      platform: device.platform,
      token: body.attestationToken,
      challenge: body.challenge,
      deviceId: device.id,
      publicKey: device.public_key,
    });
    // passed: trusted for another 30 days.
    // failed: back to pending for an admin.
    // unavailable: a device an admin approved without attestation keeps that
    //   approval (the key proof still holds); a device that used to pass
    //   attestation and now can't goes to pending.
    let next: 'trusted' | 'pending';
    if (attestation === 'passed') next = 'trusted';
    else if (attestation === 'failed') next = 'pending';
    else next = device.status === 'trusted' && device.attestation !== 'passed' ? 'trusted' : 'pending';
    const keepAttestation = attestation === 'unavailable' && next === 'trusted' ? device.attestation : attestation;

    const out = await withSession(deps.pool, { memberId: member.id, deviceId: device.id, deviceTime: c.get('deviceTime') }, async (db) => {
      await useChallenge(db, member.id, body.challenge, now);
      const r = await db.query<DeviceOut>(
        `update devices set status = $2, attestation = $3, app_version = $4,
           last_verified_at = case when $2 = 'trusted' then $5::timestamptz else last_verified_at end,
           trust_expires_at = case when $2 = 'trusted' then $6::timestamptz else trust_expires_at end
         where id = $1 returning ${DEVICE_COLUMNS}`,
        [device.id, next, keepAttestation, body.appVersion, now.toISOString(), trustExpiry(now)],
      );
      return r.rows[0]!;
    });
    return c.json({ device: out });
  });

  return app;
}
