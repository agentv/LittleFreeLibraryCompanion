// Sign-in through this service (R11), so refresh can be tied to a device (R30).
import { Hono } from 'hono';
import { z } from 'zod';
import { withSession } from '../db/session.js';
import type { Deps } from '../deps.js';
import { canonicalRequest, verifySignature } from '../devices/crypto.js';
import { parseJson, readRawBody, type DeviceRow, type Vars } from '../http/context.js';
import { ApiError } from '../http/errors.js';
import { LIMITS } from '../limits.js';

const email = z.string().email().max(320).transform((e) => e.trim().toLowerCase());
const codeBody = z.object({ email });
const verifyBody = z.object({ email, code: z.string().min(4).max(12) });
const refreshBody = z.object({ refreshToken: z.string().min(1) });

export function authRoutes(deps: Deps) {
  const app = new Hono<{ Variables: Vars }>();

  app.use('*', async (c, next) => {
    await readRawBody(c);
    await next();
  });

  /** Email a sign-in code. Always 204, so the response never reveals whether an account exists. */
  app.post('/code', async (c) => {
    const body = codeBody.parse(parseJson(c));
    await deps.auth.sendSignInCode(body.email).catch((err) => console.error('sign-in code failed', err));
    return c.body(null, 204);
  });

  app.post('/verify', async (c) => {
    const body = verifyBody.parse(parseJson(c));
    const session = await deps.auth.verifySignInCode(body.email, body.code);
    if (!session) throw new ApiError('unauthorized', 'That code is wrong or has expired.');
    return c.json(session);
  });

  /**
   * Rotates the refresh token only for a registered, non-removed device of the
   * same member, proven by the request signature. Otherwise the new tokens are
   * discarded, which ends that session.
   */
  app.post('/refresh', async (c) => {
    const body = refreshBody.parse(parseJson(c));
    const deviceId = c.req.header('x-device-id');
    const timestamp = c.req.header('x-timestamp');
    const signature = c.req.header('x-signature');
    if (!deviceId || !timestamp || !signature) throw new ApiError('unauthorized', 'Request is not signed.');
    const ts = Date.parse(timestamp);
    if (Number.isNaN(ts) || Math.abs(deps.now().getTime() - ts) > LIMITS.requestClockSkewMs) {
      throw new ApiError('unauthorized', 'Request timestamp is too far from server time.');
    }
    const device = await withSession(deps.pool, { system: true }, async (db) =>
      (await db.query<DeviceRow>('select id, member_id, public_key, platform, attestation, status, trust_expires_at from devices where id = $1', [deviceId])).rows[0],
    );
    const url = new URL(c.req.url);
    if (!device || !verifySignature(device.public_key, canonicalRequest('POST', url.pathname + url.search, c.get('rawBody'), timestamp), signature)) {
      throw new ApiError('unauthorized', 'Request signature is invalid.');
    }
    if (device.status === 'revoked') throw new ApiError('device_revoked', 'This device was removed.');
    const session = await deps.auth.refresh(body.refreshToken);
    if (!session) throw new ApiError('unauthorized', 'Sign in again.');
    if (session.userId !== device.member_id) throw new ApiError('unauthorized', 'This device belongs to another member.');
    return c.json(session);
  });

  return app;
}
