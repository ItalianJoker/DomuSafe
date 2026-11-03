/**
 * Schema Postgres SaaS — account / Famiglia / blob E2EE / sync.
 * Server memorizza solo ciphertext + metadati auth (mai plaintext runbook/vault).
 */

import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const accounts = pgTable(
  'accounts',
  {
    accountId: text('account_id').primaryKey(),
    email: text('email').notNull(),
    displayName: text('display_name').notNull(),
    passwordSaltHex: text('password_salt_hex').notNull(),
    passwordHashHex: text('password_hash_hex').notNull(),
    dataKeySaltBase64: text('data_key_salt_base64').notNull(),
    wrappedDataKeyBase64: text('wrapped_data_key_base64').notNull(),
    wrappedDataKeyIvBase64: text('wrapped_data_key_iv_base64').notNull(),
    familyId: text('family_id'),
    license: jsonb('license').notNull(),
    tutorialCompleted: boolean('tutorial_completed').notNull().default(false),
    themePreference: text('theme_preference').notNull().default('system'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull(),
  },
  (t) => [uniqueIndex('accounts_email_uidx').on(t.email)]
);

export const families = pgTable(
  'families',
  {
    familyId: text('family_id').primaryKey(),
    /** Documento Famiglia (membri, inviti, wrap chiavi opachi, branding…). */
    document: jsonb('document').notNull(),
    scanToken: text('scan_token'),
    emergencyToken: text('emergency_token'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull(),
  },
  (t) => [
    uniqueIndex('families_scan_token_uidx').on(t.scanToken),
    uniqueIndex('families_emergency_token_uidx').on(t.emergencyToken),
  ]
);

export const sessions = pgTable(
  'sessions',
  {
    sessionToken: text('session_token').primaryKey(),
    accountId: text('account_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
  },
  (t) => [index('sessions_account_idx').on(t.accountId)]
);

/**
 * Blob E2EE Famiglia (houses / succession / emergency).
 * Solo iv + ciphertext — il server non decifra.
 */
export const familyBlobs = pgTable(
  'family_blobs',
  {
    familyId: text('family_id').notNull(),
    kind: text('kind').notNull(),
    version: text('version').notNull().default('enc-1'),
    ivBase64: text('iv_base64').notNull(),
    ciphertextBase64: text('ciphertext_base64').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.familyId, t.kind] })]
);

/** Audit log metadati (non contiene ICE/vault in chiaro). */
export const auditLogs = pgTable('audit_logs', {
  familyId: text('family_id').primaryKey(),
  document: jsonb('document').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull(),
});

/** Envelope sync E2EE multi-dispositivo (ciphertext opaco). */
export const syncEnvelopes = pgTable('sync_envelopes', {
  syncId: text('sync_id').primaryKey(),
  envelope: jsonb('envelope').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull(),
});

export const syncHistory = pgTable(
  'sync_history',
  {
    syncId: text('sync_id').notNull(),
    revision: integer('revision').notNull(),
    envelope: jsonb('envelope').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.syncId, t.revision] })]
);
