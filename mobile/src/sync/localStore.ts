/**
 * LocalStore kept in memory for fast, synchronous reads, written through to
 * a persistence adapter (SQLite on the phone, memory in tests). At this
 * scale (a few stewards, hundreds of visits) everything fits easily.
 */
import type { Attachment, UUID } from '../types/models';
import type {
  ChangeSet,
  LocalStore,
  RowSyncInfo,
  StoredRow,
  SyncedRecords,
  SyncedTable,
} from './types';
import { SYNCED_TABLES } from './types';

/** Fields that exist only on the phone and are never taken from the server. */
const DEVICE_ONLY: (keyof Attachment)[] = ['localUri', 'thumbnailLocalUri', 'uploadStatus'];

export interface RowPersistence {
  loadAll(): Promise<{ rows: StoredRow[]; meta: Record<string, string> }>;
  putRows(rows: StoredRow[]): Promise<void>;
  putMeta(key: string, value: string | null): Promise<void>;
  clear(): Promise<void>;
}

export function memoryPersistence(): RowPersistence {
  let rows = new Map<string, StoredRow>();
  let meta: Record<string, string> = {};
  return {
    loadAll: async () => ({ rows: [...rows.values()], meta: { ...meta } }),
    putRows: async (list) => list.forEach((r) => rows.set(`${r.table}:${r.record.id}`, structuredCloneSafe(r))),
    putMeta: async (k, v) => {
      if (v === null) delete meta[k];
      else meta[k] = v;
    },
    clear: async () => {
      rows = new Map();
      meta = {};
    },
  };
}

function structuredCloneSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

const LOCAL: RowSyncInfo = { state: 'local', note: null };

export async function createLocalStore(persist: RowPersistence): Promise<LocalStore> {
  const tables = Object.fromEntries(SYNCED_TABLES.map((t) => [t, new Map<UUID, StoredRow>()])) as Record<SyncedTable, Map<UUID, StoredRow>>;
  let meta: Record<string, string> = {};
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());

  const loaded = await persist.loadAll();
  for (const r of loaded.rows) tables[r.table]?.set(r.record.id, r);
  meta = loaded.meta;

  function stage<T extends SyncedTable>(table: T, record: SyncedRecords[T]): StoredRow {
    const prev = tables[table].get(record.id);
    const row: StoredRow = { table, record, sync: LOCAL, version: (prev?.version ?? 0) + 1 };
    tables[table].set(record.id, row);
    return row;
  }

  const store: LocalStore = {
    get(table, id) {
      return (tables[table].get(id)?.record as SyncedRecords[typeof table] | undefined) ?? null;
    },

    list(table, where) {
      const out: SyncedRecords[typeof table][] = [];
      for (const row of tables[table].values()) {
        const rec = row.record as SyncedRecords[typeof table];
        if (rec.deletedAt) continue;
        if (where && !Object.entries(where).every(([k, v]) => (rec as unknown as Record<string, unknown>)[k] === v)) continue;
        out.push(rec);
      }
      return out;
    },

    syncInfo(table, id) {
      return tables[table].get(id)?.sync ?? null;
    },

    async save(table, record) {
      await persist.putRows([stage(table, record)]);
      notify();
    },

    async saveAll(rows) {
      const staged = rows.map((r) => stage(r.table, r.record as never));
      await persist.putRows(staged);
      notify();
    },

    async remove(table, id) {
      const row = tables[table].get(id);
      if (!row || row.record.deletedAt) return;
      await persist.putRows([stage(table, { ...row.record, deletedAt: new Date().toISOString() } as never)]);
      notify();
    },

    async patchLocal(table, id, patch) {
      const row = tables[table].get(id);
      if (!row) return;
      const next: StoredRow = { ...row, record: { ...row.record, ...patch } as never };
      tables[table].set(id, next);
      await persist.putRows([next]);
      notify();
    },

    dirtyRows() {
      const out: StoredRow[] = [];
      for (const t of SYNCED_TABLES) for (const row of tables[t].values()) if (row.sync.state === 'local') out.push(row);
      return out;
    },

    async setSyncState(updates) {
      const changed: StoredRow[] = [];
      for (const u of updates) {
        const row = tables[u.table].get(u.id);
        // Edited again while the push was in flight: keep it marked for upload.
        if (!row || row.version !== u.version) continue;
        const next = { ...row, sync: u.sync };
        tables[u.table].set(u.id, next);
        changed.push(next);
      }
      if (changed.length) {
        await persist.putRows(changed);
        notify();
      }
    },

    async applyRemote(changes: ChangeSet) {
      const changed: StoredRow[] = [];
      for (const t of SYNCED_TABLES) {
        for (const incoming of changes[t] ?? []) {
          const local = tables[t].get(incoming.id);
          if (local && local.sync.state === 'local') continue;
          let record = incoming as SyncedRecords[typeof t];
          if (t === 'attachments') {
            const prev = local?.record as Attachment | undefined;
            const inc = incoming as Attachment;
            const merged: Attachment = { ...inc };
            for (const k of DEVICE_ONLY) (merged as unknown as Record<string, unknown>)[k] = prev ? prev[k] : null;
            merged.uploadStatus = prev?.uploadStatus ?? (inc.storagePath ? 'done' : 'pending');
            record = merged as SyncedRecords[typeof t];
          }
          const row: StoredRow = { table: t, record, sync: { state: 'synced', note: null }, version: local?.version ?? 0 };
          tables[t].set(incoming.id, row);
          changed.push(row);
        }
      }
      if (changed.length) {
        await persist.putRows(changed);
        notify();
      }
    },

    getMeta(key) {
      return meta[key] ?? null;
    },

    async setMeta(key, value) {
      if (value === null) delete meta[key];
      else meta[key] = value;
      await persist.putMeta(key, value);
    },

    async clear() {
      for (const t of SYNCED_TABLES) tables[t].clear();
      meta = {};
      await persist.clear();
      notify();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return store;
}
