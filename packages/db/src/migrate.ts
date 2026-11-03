import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import pg from 'pg';

const MIGRATIONS_DIR = new URL('../migrations/', import.meta.url);
const BOOTSTRAP_FILE = new URL('../sql/bootstrap-roles.sql', import.meta.url);
const LOCK_KEY = 7_406_216_731;
const ROLES_LOCK_KEY = 7_406_216_732;

/** Options of `migrate`. */
export interface MigrateOptions {
  /** URL of a role that can create roles and `SET ROLE domusafe_owner` (superuser or `CREATEROLE`). */
  readonly connectionString: string;
  /** When set, the password of `domusafe_app` is (re)set to this value. */
  readonly appPassword?: string;
  /** Receives one line per applied migration. */
  readonly log?: (line: string) => void;
}

/** A migration file on disk. */
interface MigrationFile {
  readonly id: string;
  readonly sql: string;
  readonly checksum: string;
}

async function loadMigrations(): Promise<MigrationFile[]> {
  const names = (await readdir(MIGRATIONS_DIR)).filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name)).sort();
  return Promise.all(
    names.map(async (name) => {
      const sql = await readFile(new URL(name, MIGRATIONS_DIR), 'utf8');
      return {
        id: name.replace(/\.sql$/, ''),
        sql,
        checksum: createHash('sha256').update(sql).digest('hex'),
      };
    }),
  );
}

/**
 * Creates the cluster-wide roles `domusafe_owner` and `domusafe_app` when missing (idempotent).
 *
 * @param client - Connected client of a role allowed to create roles.
 * @param appPassword - When set, the password of `domusafe_app` is (re)set to this value.
 */
async function bootstrapRoles(client: pg.Client, appPassword: string | undefined): Promise<void> {
  await client.query('select pg_advisory_lock($1)', [ROLES_LOCK_KEY]);
  try {
    await client.query(await readFile(BOOTSTRAP_FILE, 'utf8'));
    if (appPassword !== undefined) {
      await client.query(`alter role domusafe_app password ${client.escapeLiteral(appPassword)}`);
    }
  } finally {
    await client.query('select pg_advisory_unlock($1)', [ROLES_LOCK_KEY]);
  }
}

/**
 * Creates the DomuSafe roles without touching any schema (used before creating a database).
 *
 * @param connectionString - URL of a role allowed to create roles.
 * @param appPassword - Optional password for `domusafe_app`.
 */
export async function ensureRoles(connectionString: string, appPassword?: string): Promise<void> {
  const client = new pg.Client({ connectionString, application_name: 'domusafe-migrate' });
  await client.connect();
  try {
    await bootstrapRoles(client, appPassword);
  } finally {
    await client.end();
  }
}

/**
 * Applies pending SQL migrations as `domusafe_owner`, one transaction per file, under an advisory lock.
 *
 * Preconditions: the database exists; the connecting role may create roles and become `domusafe_owner`.
 * Postconditions: roles exist, every file in `migrations/` is recorded in `schema_migrations` with its
 * checksum; an already-applied file whose content changed aborts the run.
 *
 * @param options - Connection, optional application password and logger.
 * @returns Ids of the migrations applied by this run.
 * @throws Error when an applied migration was modified or a migration fails (that file is rolled back).
 */
export async function migrate(options: MigrateOptions): Promise<string[]> {
  const client = new pg.Client({
    connectionString: options.connectionString,
    application_name: 'domusafe-migrate',
  });
  await client.connect();
  try {
    await bootstrapRoles(client, options.appPassword);
    const owner = await client.query<{ owner: string; name: string }>(
      'select pg_get_userbyid(datdba) as owner, datname as name from pg_database where datname = current_database()',
    );
    const database = owner.rows[0];
    if (database?.owner !== 'domusafe_owner') {
      throw new Error(
        `Database ${database?.name ?? '(unknown)'} must be owned by domusafe_owner: ` +
          `ALTER DATABASE ${database?.name ?? '<name>'} OWNER TO domusafe_owner`,
      );
    }
    await client.query('select pg_advisory_lock($1)', [LOCK_KEY]);
    await client.query('set role domusafe_owner');
    await client.query(`
      create table if not exists public.schema_migrations (
        id         text primary key,
        checksum   text not null,
        applied_at timestamptz not null default now()
      )`);
    const applied = new Map(
      (
        await client.query<{ id: string; checksum: string }>(
          'select id, checksum from public.schema_migrations',
        )
      ).rows.map((row) => [row.id, row.checksum]),
    );
    const done: string[] = [];
    for (const migration of await loadMigrations()) {
      const previous = applied.get(migration.id);
      if (previous !== undefined) {
        if (previous !== migration.checksum) {
          throw new Error(`Migration ${migration.id} was modified after being applied`);
        }
        continue;
      }
      await client.query('begin');
      try {
        await client.query(migration.sql);
        await client.query('insert into public.schema_migrations (id, checksum) values ($1, $2)', [
          migration.id,
          migration.checksum,
        ]);
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw new Error(`Migration ${migration.id} failed`, { cause: error });
      }
      options.log?.(`applied ${migration.id}`);
      done.push(migration.id);
    }
    return done;
  } finally {
    await client.query('reset role').catch(() => undefined);
    await client.query('select pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => undefined);
    await client.end();
  }
}
