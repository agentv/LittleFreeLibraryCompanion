// Incremental pull (R3): everything with change_seq above the cursor,
// soft-deleted rows included, oldest first, one page at a time.
import type { DbClient } from '../db/pool.js';
import { LIMITS } from '../limits.js';
import { SYNCED_TABLES, TABLES, selectList, type SyncedTable } from './tables.js';

export interface PullResult {
  changes: Record<SyncedTable, Record<string, unknown>[]>;
  /** Pass back next time. Opaque to the app. */
  cursor: string;
  /** More pages are waiting: pull again straight away. */
  hasMore: boolean;
}

export function parseCursor(cursor: string | undefined): string {
  if (!cursor) return '0';
  if (!/^\d{1,19}$/.test(cursor)) throw new Error('bad cursor');
  return cursor;
}

export async function pull(db: DbClient, cursor: string, limit: number = LIMITS.pullPageSize): Promise<PullResult> {
  const rows: { table: SyncedTable; seq: bigint; row: Record<string, unknown> }[] = [];
  for (const table of SYNCED_TABLES) {
    const r = await db.query<Record<string, unknown>>(
      `select ${selectList(TABLES[table])} from ${table} where change_seq > $1 order by change_seq limit $2`,
      [cursor, limit + 1],
    );
    for (const row of r.rows) rows.push({ table, seq: BigInt(row.changeSeq as string), row });
  }
  rows.sort((a, b) => (a.seq < b.seq ? -1 : a.seq > b.seq ? 1 : 0));
  const page = rows.slice(0, limit);
  const changes = Object.fromEntries(SYNCED_TABLES.map((t) => [t, [] as Record<string, unknown>[]])) as PullResult['changes'];
  for (const p of page) {
    const { changeSeq: _seq, ...row } = p.row;
    changes[p.table].push(row);
  }
  const last = page[page.length - 1];
  return { changes, cursor: last ? last.seq.toString() : cursor, hasMore: rows.length > limit };
}
