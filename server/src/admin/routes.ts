// Admin endpoints (R16, R31, change history R21, and the review queue).
import { Hono } from 'hono';
import { z } from 'zod';
import { withSession } from '../db/session.js';
import type { Deps } from '../deps.js';
import { DEVICE_COLUMNS, trustExpiry } from '../devices/routes.js';
import { parseJson, requireAdmin, requireDevice, requireMember, type AppContext, type MemberRow, type Vars } from '../http/context.js';
import { ApiError } from '../http/errors.js';
import { applyRow } from '../sync/push.js';
import { TABLES, type SyncedTable } from '../sync/tables.js';

const MEMBER_COLUMNS = `id, email, display_name as "displayName", role, status, status_reason as "statusReason",
  created_at as "createdAt", updated_at as "updatedAt"`;
const REVIEW_COLUMNS = `id, kind, status, table_name as "table", record_id as "recordId", member_id as "memberId",
  device_id as "deviceId", reason, payload, created_at as "createdAt", updated_at as "updatedAt",
  resolved_at as "resolvedAt", resolved_by as "resolvedBy", resolution_note as "resolutionNote"`;

const suspendBody = z.object({ reason: z.string().min(1).max(500) });
const roleBody = z.object({ role: z.enum(['steward', 'admin']) });
const resolveBody = z.object({ note: z.string().max(1000).optional() });
const memberStatus = z.enum(['pending', 'active', 'suspended']).optional();
const deviceStatus = z.enum(['pending', 'trusted', 'revoked']).optional();
const reviewStatus = z.enum(['open', 'accepted', 'rejected']).default('open');
const historyTable = z.enum(['libraries', 'visits', 'comments', 'attachments', 'members', 'devices']);

export function adminRoutes(deps: Deps) {
  const app = new Hono<{ Variables: Vars }>();
  app.use('*', requireMember(deps), requireAdmin(), requireDevice(deps, 'trusted'));

  const session = (c: AppContext) => ({
    memberId: c.get('member').id,
    deviceId: c.get('device').id,
    deviceTime: c.get('deviceTime'),
  });

  // Members ------------------------------------------------------------------

  app.get('/members', async (c) => {
    const status = memberStatus.parse(c.req.query('status'));
    const members = await withSession(deps.pool, session(c), async (db) =>
      (await db.query(`select ${MEMBER_COLUMNS} from members where ($1::text is null or status = $1) order by created_at`, [status ?? null])).rows,
    );
    return c.json({ members });
  });

  async function setMember(c: AppContext, id: string, sql: string, params: unknown[]) {
    const row = await withSession(deps.pool, session(c), async (db) => (await db.query(`${sql} where id = $1 returning ${MEMBER_COLUMNS}`, [id, ...params])).rows[0]);
    if (!row) throw new ApiError('not_found', 'No such member.');
    return c.json({ member: row });
  }

  app.post('/members/:id/approve', (c) => setMember(c, c.req.param('id'), `update members set status = 'active', status_reason = null`, []));
  app.post('/members/:id/suspend', async (c) => {
    const { reason } = suspendBody.parse(parseJson(c));
    if (c.req.param('id') === c.get('member').id) throw new ApiError('bad_request', 'You cannot suspend yourself.');
    return setMember(c, c.req.param('id'), `update members set status = 'suspended', status_reason = $2`, [reason]);
  });
  app.post('/members/:id/role', async (c) => {
    const { role } = roleBody.parse(parseJson(c));
    if (c.req.param('id') === c.get('member').id && role !== 'admin') throw new ApiError('bad_request', 'Ask another admin to change your role.');
    return setMember(c, c.req.param('id'), `update members set role = $2`, [role]);
  });

  // Devices ------------------------------------------------------------------

  app.get('/devices', async (c) => {
    const status = deviceStatus.parse(c.req.query('status'));
    const devices = await withSession(deps.pool, session(c), async (db) =>
      (await db.query(`select ${DEVICE_COLUMNS} from devices where ($1::text is null or status = $1) order by registered_at`, [status ?? null])).rows,
    );
    return c.json({ devices });
  });

  app.post('/devices/:id/approve', async (c) => {
    const now = deps.now();
    const row = await withSession(deps.pool, session(c), async (db) =>
      (await db.query(
        `update devices set status = 'trusted', last_verified_at = $2, trust_expires_at = $3
         where id = $1 and status <> 'revoked' returning ${DEVICE_COLUMNS}`,
        [c.req.param('id'), now.toISOString(), trustExpiry(now)],
      )).rows[0],
    );
    if (!row) throw new ApiError('not_found', 'No such device, or it was removed.');
    return c.json({ device: row });
  });

  app.post('/devices/:id/revoke', async (c) => {
    const row = await withSession(deps.pool, session(c), async (db) =>
      (await db.query(
        `update devices set status = 'revoked', revoked_at = now(), revoked_by = $2
         where id = $1 and status <> 'revoked' returning ${DEVICE_COLUMNS}`,
        [c.req.param('id'), c.get('member').id],
      )).rows[0],
    );
    if (!row) throw new ApiError('not_found', 'No such device, or it is already removed.');
    return c.json({ device: row });
  });

  // Review queue: address conflicts and held changes --------------------------

  app.get('/review', async (c) => {
    const status = reviewStatus.parse(c.req.query('status'));
    const items = await withSession(deps.pool, session(c), async (db) =>
      (await db.query(`select ${REVIEW_COLUMNS} from review_items where status = $1 order by created_at`, [status])).rows,
    );
    return c.json({ items });
  });

  app.post('/review/:id/accept', async (c) => {
    const { note } = resolveBody.parse(parseJson(c));
    const admin = c.get('member');
    const item = await withSession(deps.pool, session(c), async (db) => {
      const r = await db.query<{ kind: string; table_name: SyncedTable; record_id: string; member_id: string; device_id: string | null; payload: Record<string, unknown> }>(
        `update review_items set status = 'accepted', resolved_at = now(), resolved_by = $2, resolution_note = $3
         where id = $1 and status = 'open' returning kind, table_name, record_id, member_id, device_id, payload`,
        [c.req.param('id'), admin.id, note ?? null],
      );
      const it = r.rows[0];
      if (!it) throw new ApiError('not_found', 'No open review item with that id.');

      if (it.kind === 'address_conflict') {
        // The admin's decision: apply the proposed address as an admin edit.
        const p = it.payload.proposed as Record<string, unknown>;
        await db.query(
          `update libraries set address_line = $2, city = $3, county = $4, region = $5, postal_code = $6, country = $7,
             address_source = $8, address_status = $9 where id = $1`,
          [it.record_id, p.addressLine, p.city, p.county, p.region, p.postalCode, p.country, p.addressSource, p.addressStatus],
        );
      } else {
        // A held change: apply it as the member who made it, from the device it came from.
        const member = (await db.query<MemberRow>('select id, email, display_name, role, status from members where id = $1', [it.member_id])).rows[0];
        if (!member) throw new ApiError('not_found', 'The member who made this change no longer exists.');
        await db.query(`select set_config('app.member_id', $1, true), set_config('app.device_id', $2, true)`, [member.id, it.device_id ?? '']);
        try {
          await applyRow(db, deps.media, member, it.device_id ?? '', TABLES[it.table_name], it.payload);
        } catch (err) {
          if (err instanceof Error && !(err instanceof ApiError) && !(err as { code?: string }).code) {
            throw new ApiError('conflict', `The change can't be applied: ${err.message}`);
          }
          throw err;
        }
      }
      return it;
    });
    return c.json({ ok: true, kind: item.kind, table: item.table_name, recordId: item.record_id });
  });

  app.post('/review/:id/reject', async (c) => {
    const { note } = resolveBody.parse(parseJson(c));
    const row = await withSession(deps.pool, session(c), async (db) =>
      (await db.query(
        `update review_items set status = 'rejected', resolved_at = now(), resolved_by = $2, resolution_note = $3
         where id = $1 and status = 'open' returning ${REVIEW_COLUMNS}`,
        [c.req.param('id'), c.get('member').id, note ?? null],
      )).rows[0],
    );
    if (!row) throw new ApiError('not_found', 'No open review item with that id.');
    return c.json({ item: row });
  });

  // Change history -----------------------------------------------------------

  app.get('/history/:table/:id', async (c) => {
    const table = historyTable.parse(c.req.param('table'));
    const entries = await withSession(deps.pool, session(c), async (db) =>
      (await db.query(
        `select id, table_name as "table", record_id as "recordId", action, changed_by as "changedBy", device_id as "deviceId",
           changed_at as "changedAt", device_time as "deviceTime", changes
         from change_history where table_name = $1 and record_id = $2 order by changed_at, id`,
        [table, c.req.param('id')],
      )).rows,
    );
    return c.json({ entries });
  });

  return app;
}
