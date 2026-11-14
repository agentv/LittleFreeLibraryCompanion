// Request pipeline: access token -> member -> signed device (backend R29).
import type { Context, MiddlewareHandler } from 'hono';
import { verifyAccessToken } from '../auth/jwt.js';
import { withSession } from '../db/session.js';
import type { Deps } from '../deps.js';
import { canonicalRequest, verifySignature } from '../devices/crypto.js';
import { LIMITS } from '../limits.js';
import { ApiError, type DeviceReason } from './errors.js';

export interface MemberRow {
  id: string;
  email: string;
  display_name: string;
  role: 'steward' | 'admin';
  status: 'pending' | 'active' | 'suspended';
}

export interface DeviceRow {
  id: string;
  member_id: string;
  public_key: string;
  platform: 'ios' | 'android';
  attestation: 'passed' | 'failed' | 'unavailable';
  status: 'pending' | 'trusted' | 'revoked';
  trust_expires_at: string | null;
}

/** What a device may do right now. */
export type DeviceStanding = { trusted: true } | { trusted: false; revoked: boolean; reason?: DeviceReason };

export interface Vars {
  member: MemberRow;
  device: DeviceRow;
  standing: DeviceStanding;
  deviceTime: string;
  rawBody: string;
}

export type AppContext = Context<{ Variables: Vars }>;
type Mw = MiddlewareHandler<{ Variables: Vars }>;

export function deviceStanding(d: DeviceRow, now: Date): DeviceStanding {
  if (d.status === 'revoked') return { trusted: false, revoked: true };
  if (d.status === 'pending') {
    return { trusted: false, revoked: false, reason: d.attestation === 'failed' ? 'attestation_failed' : 'pending_approval' };
  }
  if (!d.trust_expires_at || new Date(d.trust_expires_at) <= now) return { trusted: false, revoked: false, reason: 'expired' };
  return { trusted: true };
}

/** Bearer token -> member row, created as a pending steward on first sight. */
export function requireMember(deps: Deps): Mw {
  return async (c, next) => {
    const header = c.req.header('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const claims = token ? await verifyAccessToken(token, deps.jwtSecret) : null;
    if (!claims) throw new ApiError('unauthorized', 'Sign in again.');
    const member = await withSession(deps.pool, { memberId: claims.sub }, async (db) => {
      const found = await db.query<MemberRow>('select id, email, display_name, role, status from members where id = $1', [claims.sub]);
      if (found.rows[0]) return found.rows[0];
      // Normally created by the sign-up form; this covers accounts made another way.
      const made = await db.query<MemberRow>(
        `insert into members (id, email, display_name) values ($1, $2, $3)
         on conflict (id) do nothing returning id, email, display_name, role, status`,
        [claims.sub, claims.email, claims.displayName],
      );
      return made.rows[0];
    });
    if (!member) throw new ApiError('unauthorized', 'Sign in again.');
    c.set('member', member);
    await next();
  };
}

export async function readRawBody(c: AppContext): Promise<string> {
  const text = c.req.method === 'GET' || c.req.method === 'HEAD' ? '' : await c.req.text();
  if (text.length > LIMITS.bodyMaxBytes) throw new ApiError('bad_request', 'Request body too large.');
  c.set('rawBody', text);
  return text;
}

export function parseJson(c: AppContext): unknown {
  const raw = c.get('rawBody');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new ApiError('bad_request', 'Body is not valid JSON.');
  }
}

/**
 * Checks the request signature against the member's registered device and
 * records how far the device is trusted. `allow` decides which standings may
 * pass: 'trusted' (default), 'registered' (any non-revoked device, e.g. to renew
 * or to have a push held), or 'any' (also revoked: listing your own devices).
 */
export function requireDevice(deps: Deps, allow: 'trusted' | 'registered' | 'any' = 'trusted'): Mw {
  return async (c, next) => {
    const member = c.get('member');
    const deviceId = c.req.header('x-device-id');
    const timestamp = c.req.header('x-timestamp');
    const signature = c.req.header('x-signature');
    if (!deviceId || !timestamp || !signature) throw new ApiError('unauthorized', 'Request is not signed.');
    const ts = Date.parse(timestamp);
    if (Number.isNaN(ts) || Math.abs(deps.now().getTime() - ts) > LIMITS.requestClockSkewMs) {
      throw new ApiError('unauthorized', 'Request timestamp is too far from server time. Check the phone clock.');
    }
    const raw = await readRawBody(c);
    const device = await withSession(deps.pool, { memberId: member.id }, async (db) => {
      const r = await db.query<DeviceRow>(
        `select id, member_id, public_key, platform, attestation, status, trust_expires_at from devices where id = $1`,
        [deviceId],
      );
      return r.rows[0];
    });
    // A device registered to someone else is invisible here (row-level security).
    if (!device || device.member_id !== member.id) {
      throw new ApiError('device_untrusted', 'This device is not registered to you.', 'pending_approval');
    }
    const url = new URL(c.req.url);
    const message = canonicalRequest(c.req.method, url.pathname + url.search, raw, timestamp);
    if (!verifySignature(device.public_key, message, signature)) throw new ApiError('unauthorized', 'Request signature is invalid.');

    const standing = deviceStanding(device, deps.now());
    if (!standing.trusted) {
      if (standing.revoked && allow !== 'any') throw new ApiError('device_revoked', 'This device was removed. Sign in on a registered device.');
      if (!standing.revoked && allow === 'trusted') throw new ApiError('device_untrusted', 'This device is not trusted yet.', standing.reason);
    }
    c.set('device', device);
    c.set('standing', standing);
    c.set('deviceTime', timestamp);
    await withSession(deps.pool, { memberId: member.id, deviceId }, (db) =>
      db.query('update devices set last_seen_at = now() where id = $1', [deviceId]),
    ).catch(() => undefined);
    await next();
  };
}

export function requireAdmin(): Mw {
  return async (c, next) => {
    const m = c.get('member');
    if (m.role !== 'admin' || m.status !== 'active') throw new ApiError('forbidden', 'Admins only.');
    await next();
  };
}
