// The sync engine against a fake backend: ordering, files, held rows and merges.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assignRole, draftToRecords, newDraft, type DraftPhoto } from '../src/features/checkin.ts';
import { conditionSentence } from '../src/features/describe.ts';
import { createEngine } from '../src/sync/engine.ts';
import { createLocalStore, memoryPersistence } from '../src/sync/localStore.ts';
import type { ChangeSet, MediaStore, PushResult, RemoteSync, SyncGate, SyncedTable } from '../src/sync/types.ts';

let n = 0;
const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
const ME = id();
const DEVICE = id();
const LIB = id();

function photo(role: DraftPhoto['role'], forComment = false): DraftPhoto {
  return {
    id: id(),
    role,
    localUri: `file:///p${n}.jpg`,
    thumbnailLocalUri: `file:///p${n}.thumb.jpg`,
    width: 1600,
    height: 1200,
    sizeBytes: 1000,
    capturedAt: '2026-11-14T12:00:00.000Z',
    latitude: null,
    longitude: null,
    forComment,
  };
}

function fakeRemote(opts: { hold?: boolean } = {}) {
  const pushes: { table: SyncedTable; ids: string[]; records: Record<string, unknown>[] }[] = [];
  const server = new Set<string>();
  const remote: RemoteSync = {
    async push(changes) {
      const result: PushResult = { accepted: [], rejected: [], held: [], flagged: [] };
      for (const t of Object.keys(changes) as SyncedTable[]) {
        const rows = (changes[t] ?? []) as { id: string }[];
        pushes.push({ table: t, ids: rows.map((r) => r.id), records: rows as never });
        for (const r of rows) {
          if (opts.hold) result.held.push({ table: t, id: r.id, reason: 'device_pending_approval' });
          else {
            server.add(r.id);
            result.accepted.push({ table: t, id: r.id });
          }
        }
      }
      return result;
    },
    async pull(cursor) {
      return { changes: { libraries: [], visits: [], comments: [], attachments: [] }, cursor: cursor ?? '1', hasMore: false };
    },
  };
  return { remote, pushes, server };
}

const media: MediaStore = {
  async upload(a) {
    return { storagePath: `media/${a.id}`, thumbnailStoragePath: a.kind === 'photo' ? `media/${a.id}.thumb` : null };
  },
  async getUrls() {
    return {};
  },
};
const open: SyncGate = async () => ({ push: true, pull: true, upload: true, reason: null });

function draft() {
  const d = newDraft(id, LIB);
  d.photos = [photo('shelf'), photo(null), photo(null, true)];
  d.stockLevel = 'low';
  d.comment = 'Hinge is loose';
  d.audio = { id: id(), localUri: 'file:///a.m4a', mimeType: 'audio/mp4', sizeBytes: 500, durationS: 42.04, capturedAt: '2026-11-14T12:00:00.000Z' };
  return d;
}

test('a finished check-in uploads rows parents first, then files, then storage paths', async () => {
  const store = await createLocalStore(memoryPersistence());
  const { remote, pushes } = fakeRemote();
  const engine = createEngine({ store, remote, media, gate: open });
  await store.saveAll(draftToRecords(draft(), { userId: ME, deviceId: DEVICE }));
  assert.ok(engine.getStatus().pendingCount > 0); // rows and files waiting
  await engine.syncNow();

  const order = pushes.map((p) => p.table);
  assert.deepEqual(order.slice(0, 3), ['visits', 'comments', 'attachments']);
  assert.equal(order[3], 'attachments'); // second push carries storage paths
  const second = pushes[3]!.records as { storagePath: string | null; localUri?: string }[];
  assert.ok(second.every((a) => a.storagePath?.startsWith('media/')));
  for (const a of store.list('attachments')) {
    assert.equal(a.uploadStatus, 'done');
    assert.equal(store.syncInfo('attachments', a.id)?.state, 'synced');
  }
  assert.equal(engine.getStatus().pendingCount, 0);
  assert.equal(engine.getStatus().state, 'idle');
});

test('rows from an untrusted phone are held, kept, and not resent', async () => {
  const store = await createLocalStore(memoryPersistence());
  const { remote, pushes } = fakeRemote({ hold: true });
  const gate: SyncGate = async () => ({ push: true, pull: false, upload: false, reason: 'waiting' });
  const engine = createEngine({ store, remote, media, gate });
  await store.saveAll(draftToRecords(draft(), { userId: ME, deviceId: DEVICE }));
  await engine.syncNow();
  const first = pushes.length;
  assert.ok(store.list('visits').every((v) => store.syncInfo('visits', v.id)?.state === 'held'));
  await engine.syncNow();
  assert.equal(pushes.length, first);
  assert.equal(engine.getStatus().state, 'paused');
  assert.ok(engine.getStatus().heldCount > 0);
});

test('a row edited while its push is in flight stays marked for upload', async () => {
  const store = await createLocalStore(memoryPersistence());
  const records = draftToRecords(draft(), { userId: ME, deviceId: DEVICE });
  await store.saveAll(records);
  const visit = records[0]!.record as ChangeSet['visits'][number];
  const remote: RemoteSync = {
    async push(changes) {
      if (changes.visits) await store.save('visits', { ...visit, condition: 'damaged' });
      const accepted = (Object.keys(changes) as SyncedTable[]).flatMap((t) => (changes[t] ?? []).map((r) => ({ table: t, id: r.id })));
      return { accepted, rejected: [], held: [], flagged: [] };
    },
    async pull(c) {
      return { changes: { libraries: [], visits: [], comments: [], attachments: [] }, cursor: c ?? '1', hasMore: false };
    },
  };
  const engine = createEngine({ store, remote, media, gate: async () => ({ push: true, pull: false, upload: false, reason: null }) });
  await engine.syncNow();
  assert.equal(store.syncInfo('visits', visit.id)?.state, 'local');
  assert.equal(store.get('visits', visit.id)?.condition, 'damaged');
});

test('pull keeps unsent local edits and device-only file fields', async () => {
  const store = await createLocalStore(memoryPersistence());
  const records = draftToRecords(draft(), { userId: ME, deviceId: DEVICE });
  await store.saveAll(records);
  const visit = records[0]!.record as ChangeSet['visits'][number];
  const att = records.find((r) => r.table === 'attachments')!.record as ChangeSet['attachments'][number];
  await store.setSyncState([{ table: 'attachments', id: att.id, version: 1, sync: { state: 'synced', note: null } }]);
  const { localUri: _l, thumbnailLocalUri: _t, uploadStatus: _u, ...wireAtt } = att;
  await store.applyRemote({
    libraries: [],
    visits: [{ ...visit, condition: 'good' }],
    comments: [],
    attachments: [{ ...wireAtt, caption: 'from server' } as never],
  });
  assert.equal(store.get('visits', visit.id)?.condition, null); // local edit not sent yet: kept
  const merged = store.get('attachments', att.id)!;
  assert.equal(merged.caption, 'from server');
  assert.equal(merged.localUri, att.localUri);
});

test('draft records: one photo per role, comment photos, voice note', () => {
  const a = photo('shelf');
  const b = photo(null);
  const photos = assignRole([a, b], b.id, 'shelf');
  assert.equal(photos.find((p) => p.id === a.id)?.role, null);
  assert.equal(photos.find((p) => p.id === b.id)?.role, 'shelf');

  const d = draft();
  const recs = draftToRecords(d, { userId: ME, deviceId: DEVICE });
  const comment = recs.find((r) => r.table === 'comments');
  assert.ok(comment);
  const atts = recs.filter((r) => r.table === 'attachments').map((r) => r.record as ChangeSet['attachments'][number]);
  assert.equal(atts.filter((x) => x.commentId === d.commentId).length, 1);
  assert.equal(atts.find((x) => x.kind === 'audio')?.durationS, 42);

  d.comment = '  ';
  const noComment = draftToRecords(d, { userId: ME, deviceId: DEVICE });
  assert.ok(!noComment.some((r) => r.table === 'comments'));
  assert.ok(noComment.filter((r) => r.table === 'attachments').every((r) => (r.record as { commentId: string | null }).commentId === null));
  const visit = noComment[0]!.record as ChangeSet['visits'][number];
  assert.equal(visit.latitude, null); // saved without a position
});

test('condition sentence reads naturally', () => {
  assert.equal(
    conditionSentence({ stockLevel: 'low', condition: 'good', doorOk: true, itemsRemoved: false }),
    'Books were running low. The box was in good shape, the door worked fine and nothing was removed.',
  );
  assert.equal(conditionSentence({ stockLevel: null, condition: null, doorOk: null, itemsRemoved: null }), 'No condition recorded.');
});
