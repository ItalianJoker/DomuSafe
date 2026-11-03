import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index.js';

/** Drizzle database bound to the DomuSafe schema. */
export type Database = NodePgDatabase<typeof schema>;
/** Transaction handle passed to `withContext` callbacks. */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Creates a connection pool for the `domusafe_app` role.
 *
 * @param connectionString - PostgreSQL URL of `domusafe_app` (never the owner or a superuser).
 * @param options - `max` connections (default 10) and the `application_name` reported to PostgreSQL.
 * @returns A `pg` pool; close it with `pool.end()`.
 */
export function createPool(
  connectionString: string,
  options: { max?: number; applicationName?: string } = {},
): pg.Pool {
  return new pg.Pool({
    connectionString,
    max: options.max ?? 10,
    application_name: options.applicationName ?? 'domusafe',
    idleTimeoutMillis: 30_000,
  });
}

/**
 * Wraps a pool in a typed Drizzle database.
 *
 * @param pool - Pool from `createPool`.
 * @returns Database whose queries are typed by the DomuSafe schema.
 */
export function createDatabase(pool: pg.Pool): Database {
  return drizzle({ client: pool, schema });
}
