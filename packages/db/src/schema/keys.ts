import { sql } from 'drizzle-orm';
import { integer, pgTable, smallint, text, uuid } from 'drizzle-orm/pg-core';
import { bytea, instant } from '../columns.js';
import { granteeKeyEnum, scopeKindEnum } from './enums.js';

/** Wrapped key material of an account (RLS model A). */
export const accountKeys = pgTable('account_keys', {
  accountId: uuid('account_id').primaryKey(),
  publicKey: bytea('public_key').notNull(),
  wrappedPrivateKey: bytea('wrapped_private_key').notNull(),
  recoveryPublicKey: bytea('recovery_public_key').notNull(),
  recoveryWrappedPrivateKey: bytea('recovery_wrapped_private_key').notNull(),
  recoveryWrappedAccountKey: bytea('recovery_wrapped_account_key').notNull(),
  recoveryVerifierSha256: bytea('recovery_verifier_sha256').notNull(),
  vaultPublicKey: bytea('vault_public_key'),
  wrappedVaultPrivateKey: bytea('wrapped_vault_private_key'),
  recoverySealedVaultKey: bytea('recovery_sealed_vault_key'),
  fingerprint: text('fingerprint').notNull(),
  keyGeneration: smallint('key_generation').notNull().default(1),
  version: integer('version').notNull().default(1),
  createdAt: instant('created_at').notNull().defaultNow(),
  updatedAt: instant('updated_at').notNull().defaultNow(),
});

/** Vault PIN verifier, server share and lockout counter (RLS model A). */
export const accountPins = pgTable('account_pins', {
  accountId: uuid('account_id').primaryKey(),
  pinSalt: bytea('pin_salt').notNull(),
  kdfMemoryKib: integer('kdf_memory_kib').notNull().default(65_536),
  kdfIterations: smallint('kdf_iterations').notNull().default(3),
  kdfParallelism: smallint('kdf_parallelism').notNull().default(1),
  verifierHash: text('verifier_hash').notNull(),
  serverShareSealed: bytea('server_share_sealed').notNull(),
  failedAttempts: smallint('failed_attempts').notNull().default(0),
  lockedAt: instant('locked_at'),
  pinGeneration: integer('pin_generation').notNull().default(1),
  updatedAt: instant('updated_at').notNull().defaultNow(),
});

/** Paired devices with their wrapped account key (RLS model A). */
export const devices = pgTable('devices', {
  id: uuid('id').primaryKey(),
  accountId: uuid('account_id').notNull(),
  label: text('label').notNull(),
  platform: text('platform', { enum: ['android', 'ios', 'windows', 'macos', 'linux', 'other'] }).notNull(),
  wrappedAccountKey: bytea('wrapped_account_key'),
  pairedVia: text('paired_via', { enum: ['signup', 'pairing', 'recovery'] }).notNull(),
  createdAt: instant('created_at').notNull().defaultNow(),
  lastSeenAt: instant('last_seen_at'),
  revokedAt: instant('revoked_at'),
});

/** Key scopes of a family. */
export const keyScopes = pgTable('key_scopes', {
  id: uuid('id').primaryKey(),
  familyId: uuid('family_id').notNull(),
  kind: scopeKindEnum('kind').notNull(),
  houseId: uuid('house_id'),
  residentId: uuid('resident_id'),
  ownerAccountId: uuid('owner_account_id'),
  currentVersion: integer('current_version').notNull().default(1),
  rotationRequiredAt: instant('rotation_required_at'),
  createdAt: instant('created_at').notNull().defaultNow(),
  createdBy: uuid('created_by'),
});

/** Versions of a scope key. */
export const scopeKeyVersions = pgTable('scope_key_versions', {
  scopeId: uuid('scope_id').notNull(),
  version: integer('version').notNull(),
  createdAt: instant('created_at').notNull().defaultNow(),
  createdBy: uuid('created_by'),
});

/** Scope-key grants (`DS-GRANT v1`) to accounts, vault keys and kiosks. */
export const scopeKeyGrants = pgTable('scope_key_grants', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  familyId: uuid('family_id').notNull(),
  scopeId: uuid('scope_id').notNull(),
  version: integer('version').notNull(),
  grantee: granteeKeyEnum('grantee').notNull(),
  granteeAccountId: uuid('grantee_account_id'),
  granteeKioskId: uuid('grantee_kiosk_id'),
  grantBlob: bytea('grant_blob').notNull(),
  grantedBy: uuid('granted_by'),
  createdAt: instant('created_at').notNull().defaultNow(),
});
