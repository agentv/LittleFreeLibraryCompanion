import { Hono } from 'hono';
import { z } from 'zod';
import { withSession } from '../db/session.js';
import type { Deps } from '../deps.js';
import { parseJson, requireDevice, requireMember, type Vars } from '../http/context.js';
import { ApiError } from '../http/errors.js';
import { parseCursor, pull } from './pull.js';
import { push } from './push.js';

const pushBody = z.object({
  changes: z.object({
    libraries: z.array(z.unknown()).optional(),
    visits: z.array(z.unknown()).optional(),
    comments: z.array(z.unknown()).optional(),
    attachments: z.array(z.unknown()).optional(),
  }),
});

export function syncRoutes(deps: Deps) {
  const app = new Hono<{ Variables: Vars }>();
  app.use('*', requireMember(deps));

  // Any device that can sign may push: untrusted devices get their rows held (decided 2026-11-14).
  app.post('/push', requireDevice(deps, 'any'), async (c) => {
    const body = pushBody.parse(parseJson(c));
    const member = c.get('member');
    const device = c.get('device');
    const result = await withSession(deps.pool, { memberId: member.id, deviceId: device.id, deviceTime: c.get('deviceTime') }, (db) =>
      push(db, deps.media, { member, deviceId: device.id, standing: c.get('standing') }, body.changes),
    );
    return c.json(result);
  });

  app.get('/pull', requireDevice(deps, 'trusted'), async (c) => {
    let cursor: string;
    try {
      cursor = parseCursor(c.req.query('cursor'));
    } catch {
      throw new ApiError('bad_request', 'Unknown cursor. Pull again without one.');
    }
    const result = await withSession(deps.pool, { memberId: c.get('member').id }, (db) => pull(db, cursor));
    // Address suggestions (R22) are a nice-to-have and not built; the field is simply absent.
    return c.json({ ...result, serverTime: deps.now().toISOString() });
  });

  return app;
}
