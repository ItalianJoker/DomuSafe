import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { ensureRoles, migrate } from './migrate.js';

/** Password given to `domusafe_app` in test clusters only. */
export const TEST_APP_PASSWORD = 'domusafe_app_test';

/** A disposable database cloned from the migrated template. */
export interface TestDatabase {
  readonly name: string;
  /** Superuser URL of the database (for assertions that must bypass RLS). */
  readonly adminUrl: string;
  /** `domusafe_app` URL of the database (what the API uses). */
  readonly appUrl: string;
  readonly drop: () => Promise<void>;
}

function withDatabase(url: string, database: string, user?: { name: string; password: string }): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  if (user !== undefined) {
    parsed.username = user.name;
    parsed.password = user.password;
  }
  return parsed.toString();
}

async function adminQuery(adminUrl: string, statement: string): Promise<void> {
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query(statement);
  } finally {
    await client.end();
  }
}

/**
 * Reads the superuser URL used by integration tests.
 *
 * @returns `DATABASE_ADMIN_URL`.
 * @throws Error when the variable is missing, with instructions to start PostgreSQL 18.
 */
export function requireAdminUrl(): string {
  const url = process.env.DATABASE_ADMIN_URL;
  if (url === undefined || url === '') {
    throw new Error(
      'DATABASE_ADMIN_URL is required for integration tests, e.g. postgres://postgres:postgres@localhost:5432/postgres ' +
        '(start PostgreSQL 18 with `docker compose -f infra/compose.dev.yml up -d postgres`).',
    );
  }
  return url;
}

/**
 * Creates and migrates a template database once per test run (Vitest global setup).
 *
 * @param adminUrl - Superuser URL pointing at any database of the cluster.
 * @returns Name of the template database.
 */
export async function prepareTemplateDatabase(adminUrl: string): Promise<string> {
  const name = `domusafe_tpl_${randomBytes(6).toString('hex')}`;
  await ensureRoles(adminUrl, TEST_APP_PASSWORD);
  await adminQuery(adminUrl, `create database ${name} owner domusafe_owner`);
  await migrate({ connectionString: withDatabase(adminUrl, name) });
  return name;
}

/**
 * Drops the template database created by `prepareTemplateDatabase`.
 *
 * @param adminUrl - Superuser URL.
 * @param name - Template name.
 */
export async function dropTemplateDatabase(adminUrl: string, name: string): Promise<void> {
  await adminQuery(adminUrl, `drop database if exists ${name} with (force)`);
}

/**
 * Clones the template into a fresh database for one test file.
 *
 * @param adminUrl - Superuser URL.
 * @param template - Template name from global setup.
 * @returns URLs of the new database and a `drop` function.
 */
export async function createTestDatabase(adminUrl: string, template: string): Promise<TestDatabase> {
  const name = `domusafe_test_${randomBytes(6).toString('hex')}`;
  await adminQuery(adminUrl, `create database ${name} template ${template} owner domusafe_owner`);
  return {
    name,
    adminUrl: withDatabase(adminUrl, name),
    appUrl: withDatabase(adminUrl, name, { name: 'domusafe_app', password: TEST_APP_PASSWORD }),
    drop: () => adminQuery(adminUrl, `drop database if exists ${name} with (force)`),
  };
}
