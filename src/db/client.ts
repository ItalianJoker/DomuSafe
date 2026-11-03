/**
 * Client Postgres (Drizzle) — SaaS SoT.
 * Richiede `DATABASE_URL` (es. postgres://domusafe:domusafe@127.0.0.1:5432/domusafe).
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';

let sql: ReturnType<typeof postgres> | null = null;
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;
let schemaReady: Promise<void> | null = null;

export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      'DATABASE_URL mancante: DomuSafe SaaS richiede Postgres (vedi README / docker-compose).'
    );
  }
  return url;
}

export function getDb() {
  if (!dbInstance) {
    sql = postgres(getDatabaseUrl(), {
      max: 8,
      idle_timeout: 20,
      prepare: false,
    });
    dbInstance = drizzle(sql, { schema });
  }
  return dbInstance;
}

/** DDL idempotente — niente filesystem SoT. */
export async function ensureDbSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const client = postgres(getDatabaseUrl(), {
        max: 1,
        onnotice: () => undefined,
      });
      try {
        await client`
          CREATE TABLE IF NOT EXISTS accounts (
            account_id TEXT PRIMARY KEY,
            email TEXT NOT NULL,
            display_name TEXT NOT NULL,
            password_salt_hex TEXT NOT NULL,
            password_hash_hex TEXT NOT NULL,
            data_key_salt_base64 TEXT NOT NULL,
            wrapped_data_key_base64 TEXT NOT NULL,
            wrapped_data_key_iv_base64 TEXT NOT NULL,
            family_id TEXT,
            license JSONB NOT NULL,
            tutorial_completed BOOLEAN NOT NULL DEFAULT FALSE,
            theme_preference TEXT NOT NULL DEFAULT 'system',
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL
          );
        `;
        await client`CREATE UNIQUE INDEX IF NOT EXISTS accounts_email_uidx ON accounts (email);`;
        await client`
          CREATE TABLE IF NOT EXISTS families (
            family_id TEXT PRIMARY KEY,
            document JSONB NOT NULL,
            scan_token TEXT,
            emergency_token TEXT,
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL
          );
        `;
        await client`CREATE UNIQUE INDEX IF NOT EXISTS families_scan_token_uidx ON families (scan_token);`;
        await client`CREATE UNIQUE INDEX IF NOT EXISTS families_emergency_token_uidx ON families (emergency_token);`;
        await client`
          CREATE TABLE IF NOT EXISTS sessions (
            session_token TEXT PRIMARY KEY,
            account_id TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL,
            expires_at TIMESTAMPTZ NOT NULL
          );
        `;
        await client`CREATE INDEX IF NOT EXISTS sessions_account_idx ON sessions (account_id);`;
        await client`
          CREATE TABLE IF NOT EXISTS family_blobs (
            family_id TEXT NOT NULL,
            kind TEXT NOT NULL,
            version TEXT NOT NULL DEFAULT 'enc-1',
            iv_base64 TEXT NOT NULL,
            ciphertext_base64 TEXT NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL,
            PRIMARY KEY (family_id, kind)
          );
        `;
        await client`
          CREATE TABLE IF NOT EXISTS audit_logs (
            family_id TEXT PRIMARY KEY,
            document JSONB NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL
          );
        `;
        await client`
          CREATE TABLE IF NOT EXISTS sync_envelopes (
            sync_id TEXT PRIMARY KEY,
            envelope JSONB NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL
          );
        `;
        await client`
          CREATE TABLE IF NOT EXISTS sync_history (
            sync_id TEXT NOT NULL,
            revision INTEGER NOT NULL,
            envelope JSONB NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL,
            PRIMARY KEY (sync_id, revision)
          );
        `;
      } finally {
        await client.end({ timeout: 5 });
      }
    })();
  }
  await schemaReady;
}

/** Svuota tabelle — solo test/smoke. */
export async function resetDatabaseForTests(): Promise<void> {
  await ensureDbSchema();
  const client = postgres(getDatabaseUrl(), { max: 1 });
  try {
    await client`
      TRUNCATE TABLE
        sync_history,
        sync_envelopes,
        audit_logs,
        family_blobs,
        sessions,
        families,
        accounts
      RESTART IDENTITY CASCADE;
    `;
  } finally {
    await client.end({ timeout: 5 });
  }
  // Reset cached pool so smoke can switch DATABASE_URL mid-run if needed.
  if (sql) {
    await sql.end({ timeout: 5 }).catch(() => undefined);
  }
  sql = null;
  dbInstance = null;
  schemaReady = null;
}

export async function closeDb(): Promise<void> {
  if (sql) {
    await sql.end({ timeout: 5 }).catch(() => undefined);
  }
  sql = null;
  dbInstance = null;
  schemaReady = null;
}
