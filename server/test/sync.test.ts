import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { attachment, createHarness, library, visit, type Harness, type TestDevice, type TestMember } from './helpers.js';

let h: Harness;
let steward: TestMember;
let phone: TestDevice;
let admin: TestMember;
let adminPhone: TestDevice;

beforeAll(async () => {
  h = await createHarness();
  steward = await h.member();
  phone = await h.device(steward);
  admin = await h.member({ role: 'admin' });
  adminPhone = await h.device(admin);
});
afterAll(async () => h?.close());

const push = (changes: Record<string, unknown[]>, member = steward, device = phone) =>
  h.call('POST', '/v1/sync/push', { changes }, { member, device });
const pullAll = async (cursor?: string) =>
  (await h.call('GET', `/v1/sync/pull${cursor ? `?cursor=${cursor}` : ''}`, undefined, { member: steward, device: phone })).json;

describe('push and pull', () => {
  it('creates a library and its first visit in one batch and pulls them back', async () => {
    const before = (await pullAll()).cursor;
    const lib = library(steward, phone);
    const v = visit(steward, phone, lib.id);
    const r = await push({ visits: [v], libraries: [lib] });
    expect(r.status).toBe(200);
    expect(r.json.rejected).toEqual([]);
    expect(r.json.accepted).toHaveLength(2);

    const p = await pullAll(before);
    expect(p.changes.libraries.map((x: any) => x.id)).toContain(lib.id);
    expect(p.changes.visits.map((x: any) => x.id)).toContain(v.id);
    expect(p.changes.libraries[0].updatedAt).toBeTruthy();
    expect(p.hasMore).toBe(false);

    const again = await pullAll(p.cursor);
    expect(again.changes.libraries).toEqual([]);
    expect(again.cursor).toBe(p.cursor);
  });

  it('is safe to push the same record twice', async () => {
    const lib = library(steward, phone);
    await push({ libraries: [lib] });
    const r = await push({ libraries: [lib] });
    expect(r.json.accepted).toHaveLength(1);
    const hist = await h.owner.query('select count(*)::int as n from change_history where record_id = $1', [lib.id]);
    expect(hist.rows[0].n).toBe(1);
  });

  it('includes soft-deleted rows in the pull', async () => {
    const lib = library(steward, phone);
    await push({ libraries: [lib] });
    const cursor = (await pullAll()).cursor;
    await push({ libraries: [{ ...lib, deletedAt: new Date().toISOString() }] });
    const p = await pullAll(cursor);
    expect(p.changes.libraries[0].deletedAt).toBeTruthy();
  });

  it('rejects bad rows individually with a reason and keeps the good ones', async () => {
    const good = library(steward, phone);
    const r = await push({
      libraries: [good, { ...library(steward, phone), latitude: 200 }, library(admin, phone)],
      visits: [visit(steward, phone, randomUUID())],
    });
    expect(r.json.accepted.map((a: any) => a.id)).toEqual([good.id]);
    const reasons = r.json.rejected.map((x: any) => x.reason);
    expect(reasons[0]).toMatch(/^invalid: latitude/);
    expect(reasons).toContain('owner_mismatch');
    expect(reasons).toContain('parent_missing');
  });

  it('lets you edit only what you created, and admins edit anything', async () => {
    const lib = library(steward, phone);
    await push({ libraries: [lib] });
    const other = await h.member();
    const otherPhone = await h.device(other);
    const denied = await push({ libraries: [{ ...lib, name: 'Hijacked' }] }, other, otherPhone);
    expect(denied.json.rejected[0].reason).toBe('permission_denied');
    const ok = await push({ libraries: [{ ...lib, name: 'Renamed by admin' }] }, admin, adminPhone);
    expect(ok.json.accepted).toHaveLength(1);
    const row = await h.owner.query('select name, created_by from libraries where id = $1', [lib.id]);
    expect(row.rows[0]).toEqual({ name: 'Renamed by admin', created_by: steward.id });
  });

  it('does not let pending or suspended members submit, but they can read', async () => {
    const pending = await h.member({ status: 'pending' });
    const d = await h.device(pending);
    const r = await push({ libraries: [library(pending, d)] }, pending, d);
    expect(r.json.rejected[0].reason).toBe('member_not_active');
    expect((await h.call('GET', '/v1/sync/pull', undefined, { member: pending, device: d })).status).toBe(200);
  });

  it('pages a long pull', async () => {
    const start = (await pullAll()).cursor;
    const libs = Array.from({ length: 3 }, () => library(steward, phone));
    await push({ libraries: libs });
    const { pull } = await import('../src/sync/pull.js');
    const db = await h.pool.connect();
    try {
      await db.query('begin');
      await db.query(`select set_config('app.member_id', $1, true)`, [steward.id]);
      const p1 = await pull(db, start, 2);
      expect(p1.changes.libraries).toHaveLength(2);
      expect(p1.hasMore).toBe(true);
      const p2 = await pull(db, p1.cursor, 2);
      expect(p2.changes.libraries).toHaveLength(1);
      expect(p2.hasMore).toBe(false);
      await db.query('commit');
    } finally {
      db.release();
    }
  });
});

describe('addresses (steward is the arbiter)', () => {
  const addr = { addressLine: '12 Elm St', city: 'Portland', county: 'Multnomah', region: 'OR', postalCode: '97201', country: 'US', addressSource: 'typed', addressStatus: 'confirmed' };

  it('accepts the first address a steward enters', async () => {
    const lib = library(steward, phone);
    await push({ libraries: [lib] });
    const r = await push({ libraries: [{ ...lib, ...addr }] });
    expect(r.json.flagged).toEqual([]);
    const row = await h.owner.query('select address_line, address_status from libraries where id = $1', [lib.id]);
    expect(row.rows[0]).toEqual({ address_line: '12 Elm St', address_status: 'confirmed' });
  });

  it('treats spacing and capital letters as the same address', async () => {
    const lib = library(steward, phone, addr);
    await push({ libraries: [lib] });
    const r = await push({ libraries: [{ ...lib, addressLine: '12  elm st ' }] });
    expect(r.json.flagged).toEqual([]);
  });

  it('flags a contradicting address for an admin and keeps the original', async () => {
    const lib = library(steward, phone, addr);
    await push({ libraries: [lib] });
    const r = await push({ libraries: [{ ...lib, name: 'New name', addressLine: '14 Oak Ave' }] });
    expect(r.json.accepted).toHaveLength(1);
    expect(r.json.flagged).toEqual([{ table: 'libraries', id: lib.id, reason: 'address_conflict' }]);
    const row = await h.owner.query('select name, address_line from libraries where id = $1', [lib.id]);
    expect(row.rows[0]).toEqual({ name: 'New name', address_line: '12 Elm St' });

    const queue = await h.call('GET', '/v1/admin/review', undefined, { member: admin, device: adminPhone });
    const item = queue.json.items.find((i: any) => i.recordId === lib.id);
    expect(item).toMatchObject({ kind: 'address_conflict', status: 'open' });
    expect(item.payload.proposed.addressLine).toBe('14 Oak Ave');
    expect(item.payload.current.addressLine).toBe('12 Elm St');

    const accept = await h.call('POST', `/v1/admin/review/${item.id}/accept`, {}, { member: admin, device: adminPhone });
    expect(accept.status).toBe(200);
    const after = await h.owner.query('select address_line from libraries where id = $1', [lib.id]);
    expect(after.rows[0].address_line).toBe('14 Oak Ave');
  });

  it('flags clearing a confirmed address', async () => {
    const lib = library(steward, phone, addr);
    await push({ libraries: [lib] });
    const r = await push({ libraries: [{ ...lib, addressLine: null, addressStatus: 'missing', addressSource: null }] });
    expect(r.json.flagged[0].reason).toBe('address_conflict');
  });

  it('applies an admin’s own address edit directly', async () => {
    const lib = library(steward, phone, addr);
    await push({ libraries: [lib] });
    const r = await push({ libraries: [{ ...lib, addressLine: '99 Admin Rd' }] }, admin, adminPhone);
    expect(r.json.flagged).toEqual([]);
    const row = await h.owner.query('select address_line from libraries where id = $1', [lib.id]);
    expect(row.rows[0].address_line).toBe('99 Admin Rd');
  });
});

describe('inputs from untrusted devices are held for an admin', () => {
  it('holds a pending device’s check-in and applies it when an admin accepts', async () => {
    const m = await h.member();
    const pendingPhone = await h.device(m, { status: 'pending' });
    const lib = library(m, pendingPhone);
    const r = await push({ libraries: [lib] }, m, pendingPhone);
    expect(r.json.held).toEqual([{ table: 'libraries', id: lib.id, reason: 'device_pending_approval' }]);
    expect((await h.owner.query('select 1 from libraries where id = $1', [lib.id])).rowCount).toBe(0);

    // Resending replaces the held copy instead of piling up duplicates.
    await push({ libraries: [{ ...lib, name: 'Second try' }] }, m, pendingPhone);
    const queue = await h.call('GET', '/v1/admin/review', undefined, { member: admin, device: adminPhone });
    const items = queue.json.items.filter((i: any) => i.recordId === lib.id);
    expect(items).toHaveLength(1);
    expect(items[0].payload.name).toBe('Second try');

    const accept = await h.call('POST', `/v1/admin/review/${items[0].id}/accept`, { note: 'ok' }, { member: admin, device: adminPhone });
    expect(accept.status).toBe(200);
    const row = await h.owner.query('select name, created_by, created_on_device_id from libraries where id = $1', [lib.id]);
    expect(row.rows[0]).toEqual({ name: 'Second try', created_by: m.id, created_on_device_id: pendingPhone.id });
  });

  it('holds check-ins from a removed device instead of dropping them', async () => {
    const m = await h.member();
    const lost = await h.device(m, { status: 'revoked' });
    const r = await push({ libraries: [library(m, lost)] }, m, lost);
    expect(r.json.held[0].reason).toBe('device_revoked');
  });

  it('lets an admin reject a held change', async () => {
    const m = await h.member();
    const d = await h.device(m, { expiresInDays: -1 });
    const lib = library(m, d);
    const r = await push({ libraries: [lib] }, m, d);
    expect(r.json.held[0].reason).toBe('device_expired');
    const queue = await h.call('GET', '/v1/admin/review', undefined, { member: admin, device: adminPhone });
    const item = queue.json.items.find((i: any) => i.recordId === lib.id);
    const rej = await h.call('POST', `/v1/admin/review/${item.id}/reject`, { note: 'duplicate' }, { member: admin, device: adminPhone });
    expect(rej.json.item.status).toBe('rejected');
  });
});

describe('visits and attachments', () => {
  it('flags far, low-accuracy and mocked positions without rejecting, and accepts no position', async () => {
    const lib = library(steward, phone);
    const far = visit(steward, phone, lib.id, { latitude: 45.51, locationAccuracyM: 80, positionMocked: true });
    const none = visit(steward, phone, lib.id, { latitude: null, longitude: null, locationAccuracyM: null, locationSource: null });
    const r = await push({ libraries: [lib], visits: [far, none] });
    expect(r.json.rejected).toEqual([]);
    const rows = await h.owner.query('select id, flag_far_from_library, flag_low_accuracy, flag_mocked from visits where id = any($1)', [[far.id, none.id]]);
    const byId = Object.fromEntries(rows.rows.map((x) => [x.id, x]));
    expect(byId[far.id]).toMatchObject({ flag_far_from_library: true, flag_low_accuracy: true, flag_mocked: true });
    expect(byId[none.id]).toMatchObject({ flag_far_from_library: false, flag_low_accuracy: false, flag_mocked: false });
  });

  it('checks uploaded files, sizes and one photo per role', async () => {
    const lib = library(steward, phone);
    const v = visit(steward, phone, lib.id);
    await push({ libraries: [lib], visits: [v] });

    const up = await h.call('POST', '/v1/media/upload-urls', { attachmentId: randomUUID(), visitId: v.id, kind: 'photo', mimeType: 'image/jpeg' }, { member: steward, device: phone });
    expect(up.status).toBe(200);
    expect(up.json.file.key).toMatch(new RegExp(`^libraries/${lib.id}/visits/${v.id}/.+\\.jpg$`));
    expect(up.json.thumbnail.key).toMatch(/\.thumb\.jpg$/);

    const a = attachment(phone, v.id);
    const key = `libraries/${lib.id}/visits/${v.id}/${a.id}.jpg`;
    const thumb = `libraries/${lib.id}/visits/${v.id}/${a.id}.thumb.jpg`;
    let r = await push({ attachments: [{ ...a, storagePath: key }] });
    expect(r.json.rejected[0].reason).toBe('file_missing');

    h.media.objects.set(key, 10 * 1024 * 1024);
    r = await push({ attachments: [{ ...a, storagePath: key }] });
    expect(r.json.rejected[0].reason).toBe('file_too_large');

    h.media.objects.set(key, 400_000);
    h.media.objects.set(thumb, 20_000);
    r = await push({ attachments: [{ ...a, storagePath: key, thumbnailStoragePath: thumb }] });
    expect(r.json.accepted).toHaveLength(1);

    r = await push({ attachments: [attachment(phone, v.id)] });
    expect(r.json.rejected[0].reason).toBe('role_taken');

    const audio = attachment(phone, v.id, { kind: 'audio', role: null, mimeType: 'audio/mp4', durationS: 120, width: null, height: null });
    r = await push({ attachments: [audio] });
    expect(r.json.rejected[0].reason).toBe('audio_too_long');

    const urls = await h.call('POST', '/v1/media/download-urls', { paths: [key, 'libraries/nope.jpg'] }, { member: steward, device: phone });
    expect(Object.keys(urls.json.urls)).toEqual([key]);
  });
});

describe('change history', () => {
  it('records who, which device and what changed', async () => {
    const lib = library(steward, phone);
    await push({ libraries: [lib] });
    await push({ libraries: [{ ...lib, name: 'Updated' }] });
    const r = await h.call('GET', `/v1/admin/history/libraries/${lib.id}`, undefined, { member: admin, device: adminPhone });
    expect(r.json.entries.map((e: any) => e.action)).toEqual(['create', 'update']);
    expect(r.json.entries[1]).toMatchObject({ changedBy: steward.id, deviceId: phone.id });
    expect(r.json.entries[1].changes.name).toEqual({ before: 'Corner Library', after: 'Updated' });
    expect(r.json.entries[1].deviceTime).toBeTruthy();
  });

  it('is admin-only', async () => {
    const r = await h.call('GET', `/v1/admin/history/libraries/${randomUUID()}`, undefined, { member: steward, device: phone });
    expect(r.status).toBe(403);
  });
});

describe('row-level security backstop', () => {
  it('blocks writes that skip the service checks', async () => {
    const db = await h.pool.connect();
    try {
      await db.query('begin');
      await db.query(`select set_config('app.member_id', $1, true)`, [steward.id]);
      const other = await h.member();
      await expect(
        db.query(
          `insert into libraries (id, name, latitude, longitude, location_source, address_status, created_by, created_on_device_id, created_at)
           values ($1, 'x', 0, 0, 'gps', 'missing', $2, $3, now())`,
          [randomUUID(), other.id, phone.id],
        ),
      ).rejects.toMatchObject({ code: '42501' });
      await db.query('rollback');
      await expect(db.query(`delete from change_history`)).rejects.toMatchObject({ code: '42501' });
    } finally {
      db.release();
    }
  });
});
