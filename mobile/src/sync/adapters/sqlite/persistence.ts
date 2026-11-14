/** RowPersistence on expo-sqlite: one row per record, JSON-encoded, plus a small key/value table. */
import * as SQLite from 'expo-sqlite';
import type { RowPersistence } from '../../localStore';
import type { StoredRow } from '../../types';

export async function openSqlitePersistence(name = 'lfl.db'): Promise<RowPersistence> {
  const db = await SQLite.openDatabaseAsync(name);
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS rows (
      tbl TEXT NOT NULL,
      id TEXT NOT NULL,
      data TEXT NOT NULL,
      sync_state TEXT NOT NULL,
      sync_note TEXT,
      version INTEGER NOT NULL,
      PRIMARY KEY (tbl, id)
    );
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
  `);

  // expo-sqlite can't nest transactions, so writes go one at a time.
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const next = queue.then(task, task);
    queue = next.catch(() => undefined);
    return next;
  };

  return {
    async loadAll() {
      const rows = await db.getAllAsync<{ tbl: string; data: string; sync_state: string; sync_note: string | null; version: number }>(
        'SELECT tbl, data, sync_state, sync_note, version FROM rows',
      );
      const meta = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM meta');
      return {
        rows: rows.map((r) => ({
          table: r.tbl as StoredRow['table'],
          record: JSON.parse(r.data),
          sync: { state: r.sync_state as StoredRow['sync']['state'], note: r.sync_note },
          version: r.version,
        })),
        meta: Object.fromEntries(meta.map((m) => [m.key, m.value])),
      };
    },
    putRows(rows) {
      return serial(() => db.withTransactionAsync(async () => {
        for (const r of rows) {
          await db.runAsync(
            'INSERT OR REPLACE INTO rows (tbl, id, data, sync_state, sync_note, version) VALUES (?, ?, ?, ?, ?, ?)',
            r.table,
            r.record.id,
            JSON.stringify(r.record),
            r.sync.state,
            r.sync.note,
            r.version,
          );
        }
      }));
    },
    putMeta(key, value) {
      return serial(async () => {
        if (value === null) await db.runAsync('DELETE FROM meta WHERE key = ?', key);
        else await db.runAsync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', key, value);
      });
    },
    clear() {
      return serial(() => db.execAsync('DELETE FROM rows; DELETE FROM meta;'));
    },
  };
}
