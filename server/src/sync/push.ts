// Applies pushed rows (backend R1 to R5, R14, R15, R25, R32), plus the two
// review rules decided 2026-11-14:
//  - a steward's address that contradicts the confirmed address on record is
//    flagged for an admin and the original stays in place;
//  - anything from a device that isn't trusted (pending, failed attestation,
//    expired or revoked) is held for an admin instead of applied or dropped.
import type { DbClient } from '../db/pool.js';
import { withSavepoint } from '../db/session.js';
import type { DeviceStanding, MemberRow } from '../http/context.js';
import { LIMITS } from '../limits.js';
import { MIME_EXT, mediaKey, type MediaStorage } from '../media/storage.js';
import { ADDRESS_FIELDS, SYNCED_TABLES, TABLES, type SyncedTable, type TableSpec } from './tables.js';

export type ChangeSet = Partial<Record<SyncedTable, unknown[]>>;

export interface RowOutcome {
  table: SyncedTable;
  id: string;
  reason: string;
}

export interface PushResult {
  accepted: { table: SyncedTable; id: string }[];
  rejected: RowOutcome[];
  /** Held for admin review (untrusted device). Keep them on the phone; don't resend. */
  held: RowOutcome[];
  /** Applied, but part of the change awaits an admin (e.g. an address conflict). */
  flagged: RowOutcome[];
}

class Reject extends Error {}

export interface PushActor {
  member: MemberRow;
  deviceId: string;
  standing: DeviceStanding;
}

type Rec = Record<string, unknown>;

function rowId(raw: unknown): string {
  return raw && typeof raw === 'object' && typeof (raw as Rec).id === 'string' ? ((raw as Rec).id as string) : '';
}

export async function push(db: DbClient, media: MediaStorage, actor: PushActor, changes: ChangeSet): Promise<PushResult> {
  const result: PushResult = { accepted: [], rejected: [], held: [], flagged: [] };
  const total = SYNCED_TABLES.reduce((n, t) => n + (changes[t]?.length ?? 0), 0);
  if (total > LIMITS.pushMaxRows) {
    for (const t of SYNCED_TABLES) for (const r of changes[t] ?? []) result.rejected.push({ table: t, id: rowId(r), reason: 'batch_too_large' });
    return result;
  }
  // Same lock the row-stamping trigger takes: serialises read-then-write per batch.
  await db.query('select pg_advisory_xact_lock(727001)');
  // Parents before children so a batch can create a library and its first visit together.
  for (const table of SYNCED_TABLES) {
    for (const raw of changes[table] ?? []) {
      const id = rowId(raw);
      try {
        const outcome = await withSavepoint(db, () => pushRow(db, media, actor, table, raw));
        if (outcome.kind === 'held') result.held.push({ table, id, reason: outcome.reason });
        else {
          result.accepted.push({ table, id });
          if (outcome.flag) result.flagged.push({ table, id, reason: outcome.flag });
        }
      } catch (err) {
        result.rejected.push({ table, id, reason: rejectionReason(err) });
      }
    }
  }
  return result;
}

function rejectionReason(err: unknown): string {
  if (err instanceof Reject) return err.message;
  const code = (err as { code?: string }).code;
  if (code === '42501') return 'permission_denied'; // row-level security
  if (code === '23503') return 'parent_missing';
  if (code === '23505') return 'role_taken'; // one photo per role per visit
  if (code === '23514' || code === '22P02' || code === '22007') return 'invalid';
  throw err; // unexpected: fail the request rather than hide it
}

type RowResult = { kind: 'applied'; flag?: string } | { kind: 'held'; reason: string };

async function pushRow(db: DbClient, media: MediaStorage, actor: PushActor, table: SyncedTable, raw: unknown): Promise<RowResult> {
  const spec = TABLES[table];
  const parsed = spec.schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Reject(`invalid: ${issue?.path.join('.') || 'record'} ${issue?.message ?? ''}`.trim());
  }
  const rec = parsed.data as Rec;
  if (actor.member.status !== 'active') throw new Reject('member_not_active');

  if (!actor.standing.trusted) {
    const reason = actor.standing.revoked ? 'device_revoked' : `device_${actor.standing.reason ?? 'untrusted'}`;
    await holdForReview(db, actor, table, rec, reason);
    return { kind: 'held', reason };
  }
  return applyRow(db, media, actor.member, actor.deviceId, spec, rec);
}

export async function holdForReview(db: DbClient, actor: PushActor, table: SyncedTable, rec: Rec, reason: string): Promise<void> {
  await db.query(
    `insert into review_items (kind, table_name, record_id, member_id, device_id, reason, payload)
     values ('held_change', $1, $2, $3, $4, $5, $6)
     on conflict (kind, table_name, record_id) where status = 'open'
     do update set payload = excluded.payload, reason = excluded.reason, device_id = excluded.device_id`,
    [table, rec.id, actor.member.id, actor.deviceId, reason, JSON.stringify(rec)],
  );
}

/**
 * Inserts or updates one validated record as `member`. Also used when an admin
 * accepts a held change. `deviceId` is the device the record came from.
 */
export async function applyRow(
  db: DbClient,
  media: MediaStorage,
  member: MemberRow,
  deviceId: string,
  spec: TableSpec,
  rec: Rec,
): Promise<{ kind: 'applied'; flag?: string }> {
  if (member.status !== 'active') throw new Reject('member_not_active');
  await db.query('select pg_advisory_xact_lock(727001)'); // re-entrant; see push()
  const isAdmin = member.role === 'admin';
  // Plain select, not FOR UPDATE: under RLS that would hide rows you may read but
  // not edit. Writers are serialised by the advisory lock taken in push().
  const existing = (await db.query<Rec>(`select * from ${spec.table} where id = $1`, [rec.id])).rows[0];

  if (!existing) {
    if (spec.ownerField && rec[spec.ownerField] !== member.id) throw new Reject('owner_mismatch');
    if (rec.createdOnDeviceId !== deviceId) throw new Reject('device_mismatch');
  } else if (existing[spec.ownerColumn] !== member.id && !isAdmin) {
    throw new Reject('permission_denied');
  }

  const values: Rec = {};
  for (const [field, column] of Object.entries(spec.fields)) {
    if (existing && spec.immutable.includes(field)) continue;
    values[column] = rec[field] === undefined ? null : rec[field];
  }
  if (!existing && spec.table === 'attachments') values.created_by = member.id;

  let flag: string | undefined;
  if (spec.table === 'libraries' && existing && !isAdmin) flag = await checkAddress(db, member, deviceId, rec, existing, values);
  if (spec.table === 'visits') Object.assign(values, await visitFlags(db, rec));
  if (spec.table === 'attachments') await checkAttachment(db, media, rec, existing);
  if (spec.table === 'comments' && !existing) await checkParentVisible(db, 'visits', rec.visitId as string);

  const columns = Object.keys(values);
  const params = columns.map((c) => values[c]);
  if (!existing) {
    await db.query(
      `insert into ${spec.table} (${columns.join(', ')}) values (${columns.map((_, i) => `$${i + 1}`).join(', ')})`,
      params,
    );
  } else {
    // Skip the write (and its history entry) when nothing changed: re-pushing is safe (R2).
    const sets = columns.map((c, i) => `${c} = $${i + 1}`).join(', ');
    const lhs = columns.join(', ');
    const rhs = columns.map((_, i) => `$${i + 1}`).join(', ');
    await db.query(
      `update ${spec.table} set ${sets} where id = $${columns.length + 1} and row(${lhs}) is distinct from row(${rhs})`,
      [...params, rec.id],
    );
  }
  return { kind: 'applied', flag };
}

function normalise(v: unknown): string {
  return typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').toLowerCase() : '';
}

const ADDRESS_COLUMNS: Record<string, string> = {
  addressLine: 'address_line',
  city: 'city',
  county: 'county',
  region: 'region',
  postalCode: 'postal_code',
  country: 'country',
};

/**
 * The steward's address wins unless the library already has a confirmed
 * address and this one contradicts it. Then the original stays, and the
 * proposed address goes to an admin. Admins' own edits apply directly.
 */
async function checkAddress(db: DbClient, member: MemberRow, deviceId: string, rec: Rec, existing: Rec, values: Rec): Promise<string | undefined> {
  if (existing.address_status !== 'confirmed') return undefined;
  const clears = rec.addressStatus === 'missing';
  const differs = ADDRESS_FIELDS.some((f) => normalise(rec[f]) !== normalise(existing[ADDRESS_COLUMNS[f]!]));
  if (!clears && !differs) return undefined;

  for (const f of ADDRESS_FIELDS) delete values[ADDRESS_COLUMNS[f]!];
  delete values.address_source;
  delete values.address_status;
  const proposed: Rec = { addressSource: rec.addressSource, addressStatus: rec.addressStatus };
  const current: Rec = { addressSource: existing.address_source, addressStatus: existing.address_status };
  for (const f of ADDRESS_FIELDS) {
    proposed[f] = rec[f] ?? null;
    current[f] = existing[ADDRESS_COLUMNS[f]!] ?? null;
  }
  await db.query(
    `insert into review_items (kind, table_name, record_id, member_id, device_id, reason, payload)
     values ('address_conflict', 'libraries', $1, $2, $3, 'address_differs_from_record', $4)
     on conflict (kind, table_name, record_id) where status = 'open'
     do update set payload = excluded.payload, member_id = excluded.member_id, device_id = excluded.device_id`,
    [rec.id, member.id, deviceId, JSON.stringify({ proposed, current })],
  );
  return 'address_conflict';
}

function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const r = 6371000;
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

/** Location sanity flags (R25): flag, never reject. Visits without a position are fine. */
async function visitFlags(db: DbClient, rec: Rec): Promise<Rec> {
  const lib = (await db.query<{ latitude: number; longitude: number }>('select latitude, longitude from libraries where id = $1', [rec.libraryId])).rows[0];
  if (!lib) throw new Reject('parent_missing');
  const hasPos = typeof rec.latitude === 'number' && typeof rec.longitude === 'number';
  return {
    flag_far_from_library: hasPos && distanceM(lib.latitude, lib.longitude, rec.latitude as number, rec.longitude as number) > LIMITS.visitFarFromLibraryM,
    flag_low_accuracy: typeof rec.locationAccuracyM === 'number' && rec.locationAccuracyM > LIMITS.lowAccuracyM,
    flag_mocked: rec.positionMocked === true,
  };
}

async function checkParentVisible(db: DbClient, table: 'visits', id: string): Promise<void> {
  const r = await db.query(`select 1 from ${table} where id = $1`, [id]);
  if (!r.rowCount) throw new Reject('parent_missing');
}

/** Media rules (R9): size and length limits, and the file must really be in S3 at its expected key. */
async function checkAttachment(db: DbClient, media: MediaStorage, rec: Rec, existing: Rec | undefined): Promise<void> {
  const visit = (await db.query<{ library_id: string }>('select library_id from visits where id = $1', [rec.visitId])).rows[0];
  if (!visit) throw new Reject('parent_missing');
  if (rec.commentId) {
    const comment = (await db.query<{ visit_id: string }>('select visit_id from comments where id = $1', [rec.commentId])).rows[0];
    if (!comment) throw new Reject('parent_missing');
    if (comment.visit_id !== rec.visitId) throw new Reject('invalid: commentId belongs to another visit');
  }
  const kind = existing ? (existing.kind as string) : (rec.kind as string);
  if (kind === 'audio' && rec.role) throw new Reject('invalid: role is for photos only');
  if (kind === 'audio' && typeof rec.durationS === 'number' && rec.durationS > LIMITS.audioMaxSeconds + 1) throw new Reject('audio_too_long');
  const ext = MIME_EXT[rec.mimeType as string];
  if (!ext || !(rec.mimeType as string).startsWith(kind === 'photo' ? 'image/' : 'audio/')) throw new Reject('unsupported_type');

  const checkFile = async (path: unknown, previous: unknown, thumbnail: boolean) => {
    if (path === null || path === undefined || path === previous) return;
    const expected = mediaKey({ libraryId: visit.library_id, visitId: rec.visitId as string, attachmentId: rec.id as string, ext: thumbnail ? 'jpg' : ext, thumbnail });
    if (path !== expected) throw new Reject('invalid: storage path');
    const head = await media.head(expected);
    if (!head) throw new Reject('file_missing');
    const max = thumbnail ? LIMITS.thumbnailMaxBytes : kind === 'photo' ? LIMITS.photoMaxBytes : LIMITS.audioMaxBytes;
    if (head.sizeBytes > max) throw new Reject('file_too_large');
  };
  await checkFile(rec.storagePath, existing?.storage_path, false);
  if (kind === 'photo') await checkFile(rec.thumbnailStoragePath, existing?.thumbnail_storage_path, true);
  else if (rec.thumbnailStoragePath) throw new Reject('invalid: thumbnails are for photos only');
}
