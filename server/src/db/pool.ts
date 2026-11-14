import pg from 'pg';

// Return timestamptz as ISO strings and bigint (change_seq) as strings,
// so nothing loses precision or time zone on the way out.
pg.types.setTypeParser(pg.types.builtins.TIMESTAMPTZ, (v) => new Date(v).toISOString());
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => v);

export type Pool = pg.Pool;
export type DbClient = pg.PoolClient;

export function createPool(connectionString: string): Pool {
  // Small pool: the expected peak is about 15 stewards (backend Context).
  return new pg.Pool({ connectionString, max: 10 });
}
