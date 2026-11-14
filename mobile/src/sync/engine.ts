/**
 * The sync engine: rows and files in separate queues (features doc section 4).
 * One run: push changed rows (parents first), upload files for attachments
 * whose visit the server has, push the new storage paths, then pull.
 * Backend-agnostic; adapters do the talking.
 */
import { SYNC } from '../config/sync';
import type { Attachment } from '../types/models';
import { isTransient, SyncError } from './errors';
import type {
  ChangeSet,
  LocalStore,
  MediaStore,
  RemoteSync,
  RowSyncInfo,
  StoredRow,
  SyncEngine,
  SyncGate,
  SyncStatus,
  SyncedTable,
} from './types';
import { SYNCED_TABLES } from './types';

const CURSOR_KEY = 'sync.cursor';
const LAST_SYNCED_KEY = 'sync.lastSyncedAt';

/** Rejections that clear up by themselves once a parent row arrives or a file is re-sent. */
const RETRYABLE_REJECTIONS = new Set(['parent_missing', 'file_missing']);

export interface EngineOptions {
  store: LocalStore;
  remote: RemoteSync;
  media: MediaStore;
  gate: SyncGate;
  /** Told about errors that need the app's attention (unauthorized, revoked, expired trust). */
  onError?: (err: SyncError) => void;
}

/** Visit ids whose own row, or any file, is still waiting to upload. */
export function waitingVisitIds(store: LocalStore): Set<string> {
  const out = new Set<string>();
  for (const v of store.list('visits')) if (store.syncInfo('visits', v.id)?.state === 'local') out.add(v.id);
  for (const c of store.list('comments')) if (store.syncInfo('comments', c.id)?.state === 'local') out.add(c.visitId);
  for (const a of store.list('attachments')) {
    if (store.syncInfo('attachments', a.id)?.state === 'local' || needsFileUpload(a)) out.add(a.visitId);
  }
  return out;
}

export function needsFileUpload(a: Attachment): boolean {
  return !a.deletedAt && !!a.localUri && !a.storagePath;
}

export function countPending(store: LocalStore): { pending: number; held: number } {
  let pending = 0;
  let held = 0;
  for (const row of store.dirtyRows()) if (row.record.id) pending++;
  for (const t of SYNCED_TABLES) for (const r of store.list(t)) if (store.syncInfo(t, r.id)?.state === 'held') held++;
  for (const a of store.list('attachments')) if (needsFileUpload(a)) pending++;
  return { pending, held };
}

export function createEngine(opts: EngineOptions): SyncEngine {
  const { store, remote, media } = opts;
  const listeners = new Set<(s: SyncStatus) => void>();
  let running: Promise<void> | null = null;
  let status: SyncStatus = {
    state: 'idle',
    pendingCount: 0,
    heldCount: 0,
    lastSyncedAt: store.getMeta(LAST_SYNCED_KEY),
    lastError: null,
    pausedReason: null,
  };

  function setStatus(patch: Partial<SyncStatus>) {
    const counts = countPending(store);
    status = { ...status, ...patch, pendingCount: counts.pending, heldCount: counts.held };
    listeners.forEach((l) => l(status));
  }
  store.subscribe(() => {
    const counts = countPending(store);
    if (counts.pending !== status.pendingCount || counts.held !== status.heldCount) setStatus({});
  });

  async function pushDirty(): Promise<void> {
    const dirty = store.dirtyRows();
    if (!dirty.length) return;
    // Parents first: a visit needs its library, an attachment its visit.
    const byTable = new Map<SyncedTable, StoredRow[]>();
    for (const t of SYNCED_TABLES) byTable.set(t, []);
    for (const r of dirty) byTable.get(r.table)!.push(r);

    for (const t of SYNCED_TABLES) {
      const rows = byTable.get(t)!;
      for (let i = 0; i < rows.length; i += SYNC.PUSH_BATCH_ROWS) {
        const batch = rows.slice(i, i + SYNC.PUSH_BATCH_ROWS);
        const versions = new Map(batch.map((r) => [r.record.id, r.version]));
        const changes: Partial<ChangeSet> = { [t]: batch.map((r) => r.record) };
        const result = await remote.push(changes);
        const updates: { table: SyncedTable; id: string; version: number; sync: RowSyncInfo }[] = [];
        const mark = (id: string, sync: RowSyncInfo) => {
          const version = versions.get(id);
          if (version !== undefined) updates.push({ table: t, id, version, sync });
        };
        for (const a of result.accepted) mark(a.id, { state: 'synced', note: null });
        for (const f of result.flagged) mark(f.id, { state: 'flagged', note: f.reason });
        for (const h of result.held) mark(h.id, { state: 'held', note: h.reason });
        for (const r of result.rejected) {
          if (RETRYABLE_REJECTIONS.has(r.reason)) continue; // stays local; tried again next run
          mark(r.id, { state: 'rejected', note: r.reason });
        }
        await store.setSyncState(updates);
      }
    }
  }

  async function uploadFiles(): Promise<boolean> {
    let uploaded = false;
    for (const a of store.list('attachments')) {
      if (!needsFileUpload(a)) continue;
      // The server only signs uploads for visits it already has.
      const visitState = store.syncInfo('visits', a.visitId)?.state;
      if (visitState !== 'synced' && visitState !== 'flagged') continue;
      await store.patchLocal('attachments', a.id, { uploadStatus: 'uploading' });
      try {
        const paths = await media.upload(a);
        const latest = store.get('attachments', a.id);
        if (!latest) continue;
        await store.save('attachments', { ...latest, ...paths, uploadStatus: 'done' });
        uploaded = true;
      } catch (err) {
        await store.patchLocal('attachments', a.id, { uploadStatus: 'failed' });
        throw err;
      }
    }
    return uploaded;
  }

  async function pullAll(): Promise<void> {
    let cursor = store.getMeta(CURSOR_KEY);
    for (let page = 0; page < 100; page++) {
      const res = await remote.pull(cursor);
      await store.applyRemote(res.changes);
      cursor = res.cursor;
      await store.setMeta(CURSOR_KEY, cursor);
      if (!res.hasMore) break;
    }
  }

  async function run(): Promise<void> {
    setStatus({ state: 'syncing' });
    try {
      const gate = await opts.gate();
      if (!gate.push && !gate.pull) {
        setStatus({ state: 'paused', pausedReason: gate.reason });
        return;
      }
      setStatus({ pausedReason: gate.reason });
      if (gate.push) await pushDirty();
      if (gate.upload && (await uploadFiles()) && gate.push) await pushDirty();
      if (gate.pull) await pullAll();
      const now = new Date().toISOString();
      await store.setMeta(LAST_SYNCED_KEY, now);
      setStatus({ state: gate.reason ? 'paused' : 'idle', lastSyncedAt: now, lastError: null });
    } catch (err) {
      const e = err instanceof SyncError ? err : new SyncError('server_error', err instanceof Error ? err.message : String(err));
      setStatus({ state: e.code === 'offline' || e.code === 'timeout' ? 'offline' : 'error', lastError: e.message });
      if (!isTransient(e.code)) opts.onError?.(e);
      throw e;
    }
  }

  return {
    store,
    media,
    syncNow() {
      if (!running) running = run().finally(() => (running = null));
      return running;
    },
    getStatus: () => status,
    subscribe(listener) {
      listeners.add(listener);
      listener(status);
      return () => listeners.delete(listener);
    },
  };
}
