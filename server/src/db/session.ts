import type { DbClient, Pool } from './pool.js';

/** Who a transaction runs as. Sets the settings row-level security reads. */
export interface SessionContext {
  memberId?: string;
  deviceId?: string;
  /** The device's clock for this request (X-Timestamp), for change history. */
  deviceTime?: string;
  /** Pre-member operations: sign-up, token refresh. */
  system?: boolean;
}

export async function withSession<T>(pool: Pool, ctx: SessionContext, fn: (db: DbClient) => Promise<T>): Promise<T> {
  const db = await pool.connect();
  try {
    await db.query('begin');
    await db.query(
      `select set_config('app.member_id', $1, true), set_config('app.device_id', $2, true),
              set_config('app.device_time', $3, true), set_config('app.system', $4, true)`,
      [ctx.memberId ?? '', ctx.deviceId ?? '', ctx.deviceTime ?? '', ctx.system ? 'on' : ''],
    );
    const result = await fn(db);
    await db.query('commit');
    return result;
  } catch (err) {
    await db.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    db.release();
  }
}

/** Run fn inside a savepoint so one failing row doesn't abort the transaction. */
export async function withSavepoint<T>(db: DbClient, fn: () => Promise<T>): Promise<T> {
  await db.query('savepoint row_sp');
  try {
    const result = await fn();
    await db.query('release savepoint row_sp');
    return result;
  } catch (err) {
    await db.query('rollback to savepoint row_sp');
    throw err;
  }
}
