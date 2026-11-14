// The signed-in member's own account and devices (R31).
import { Hono } from 'hono';
import { withSession } from '../db/session.js';
import type { Deps } from '../deps.js';
import { DEVICE_COLUMNS } from '../devices/routes.js';
import { requireDevice, requireMember, type Vars } from '../http/context.js';
import { ApiError } from '../http/errors.js';

export function meRoutes(deps: Deps) {
  const app = new Hono<{ Variables: Vars }>();
  app.use('*', requireMember(deps));

  // Unsigned on purpose: right after sign-in the app needs this before the device is registered.
  app.get('/', (c) => {
    const m = c.get('member');
    return c.json({ member: { id: m.id, email: m.email, displayName: m.display_name, role: m.role, status: m.status } });
  });

  app.get('/devices', requireDevice(deps, 'any'), async (c) => {
    const member = c.get('member');
    const devices = await withSession(deps.pool, { memberId: member.id }, async (db) =>
      (await db.query(`select ${DEVICE_COLUMNS} from devices where member_id = $1 order by registered_at`, [member.id])).rows,
    );
    return c.json({ devices });
  });

  app.post('/devices/:id/revoke', requireDevice(deps, 'registered'), async (c) => {
    const member = c.get('member');
    const id = c.req.param('id');
    const done = await withSession(deps.pool, { memberId: member.id, deviceId: c.get('device').id, deviceTime: c.get('deviceTime') }, async (db) => {
      const r = await db.query(
        `update devices set status = 'revoked', revoked_at = now(), revoked_by = $2
         where id = $1 and member_id = $2 and status <> 'revoked' returning id`,
        [id, member.id],
      );
      return r.rowCount;
    });
    if (!done) throw new ApiError('not_found', 'No such device, or it is already removed.');
    return c.json({ ok: true });
  });

  return app;
}
