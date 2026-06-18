/**
 * Database connection pool using `pg`.
 *
 * Exposes a lazily-initialised Pool singleton and a convenience `query`
 * wrapper so callers don't need to manage pool references directly.
 */

import pg from "pg";

const { Pool } = pg;

let pool: pg.Pool | null = null;

/**
 * Return the shared connection pool, creating it on first call.
 * Reads `DATABASE_URL` from the environment.
 *
 * @throws {Error} if DATABASE_URL is not set
 */
export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    pool = new Pool({ connectionString });
  }
  return pool;
}

/**
 * Execute a parameterised SQL query against the shared pool.
 *
 * @param text - SQL query string with `$1`, `$2`, … placeholders
 * @param params - Positional parameter values
 * @returns The raw `pg.QueryResult`
 */
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return getPool().query<T>(text, params);
}

/**
 * Gracefully shut down the connection pool.
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
