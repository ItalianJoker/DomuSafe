import { sql } from 'drizzle-orm';
import { boolean, char, inet, integer, jsonb, pgTable, smallint, text, uuid } from 'drizzle-orm/pg-core';
import { citext, instant } from '../columns.js';

/** Better Auth `user` model (`auth_users`). Property names follow Better Auth field names. */
export const authUsers = pgTable('auth_users', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  name: text('name').notNull(),
  email: citext('email').notNull(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  twoFactorEnabled: boolean('two_factor_enabled').notNull().default(false),
  createdAt: instant('created_at').notNull().defaultNow(),
  updatedAt: instant('updated_at').notNull().defaultNow(),
});

/** Better Auth `session` model (`auth_sessions`). */
export const authSessions = pgTable('auth_sessions', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  userId: uuid('user_id')
    .notNull()
    .references(() => authUsers.id, { onDelete: 'cascade' }),
  token: text('token').notNull(),
  expiresAt: instant('expires_at').notNull(),
  userAgent: text('user_agent'),
  ipAddress: text('ip_address'),
  deviceId: uuid('device_id'),
  freshUntil: instant('fresh_until'),
  createdAt: instant('created_at').notNull().defaultNow(),
  updatedAt: instant('updated_at').notNull().defaultNow(),
});

/** Better Auth `account` model (`auth_accounts`): credential and provider links. */
export const authAccounts = pgTable('auth_accounts', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  userId: uuid('user_id')
    .notNull()
    .references(() => authUsers.id, { onDelete: 'cascade' }),
  providerId: text('provider_id').notNull(),
  accountId: text('account_id').notNull(),
  password: text('password'),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: instant('access_token_expires_at'),
  refreshTokenExpiresAt: instant('refresh_token_expires_at'),
  scope: text('scope'),
  createdAt: instant('created_at').notNull().defaultNow(),
  updatedAt: instant('updated_at').notNull().defaultNow(),
});

/** Better Auth `verification` model (`auth_verifications`). */
export const authVerifications = pgTable('auth_verifications', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: instant('expires_at').notNull(),
  createdAt: instant('created_at').notNull().defaultNow(),
  updatedAt: instant('updated_at').notNull().defaultNow(),
});

/** Better Auth two-factor plugin model (`auth_two_factors`). */
export const authTwoFactors = pgTable('auth_two_factors', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  userId: uuid('user_id')
    .notNull()
    .references(() => authUsers.id, { onDelete: 'cascade' }),
  secret: text('secret').notNull(),
  backupCodes: text('backup_codes').notNull(),
  verified: boolean('verified').notNull().default(true),
  failedVerificationCount: integer('failed_verification_count').notNull().default(0),
  lockedUntil: instant('locked_until'),
});

/** Domain profile of an account (`account_profiles`, RLS model A). */
export const accountProfiles = pgTable('account_profiles', {
  accountId: uuid('account_id')
    .primaryKey()
    .references(() => authUsers.id, { onDelete: 'cascade' }),
  displayName: text('display_name').notNull(),
  locale: text('locale', { enum: ['it', 'en'] })
    .notNull()
    .default('it'),
  theme: text('theme', { enum: ['light', 'dark', 'system'] })
    .notNull()
    .default('system'),
  primaryFamilyId: uuid('primary_family_id'),
  lastFamilyId: uuid('last_family_id'),
  lastHouseId: uuid('last_house_id'),
  createdAt: instant('created_at').notNull().defaultNow(),
  updatedAt: instant('updated_at').notNull().defaultNow(),
});

/** Security events with IP address (`security_events`, partitioned monthly, 90-day retention). */
export const securityEvents = pgTable('security_events', {
  id: uuid('id')
    .notNull()
    .default(sql`uuidv7()`),
  occurredAt: instant('occurred_at').notNull().defaultNow(),
  accountId: uuid('account_id'),
  kind: text('kind', {
    enum: [
      'sign_in',
      'sign_in_failed',
      'sign_out',
      'two_factor_enabled',
      'two_factor_disabled',
      'two_factor_failed',
      'password_changed',
      'session_revoked',
      'device_paired',
      'device_revoked',
      'pin_set',
      'pin_failed',
      'pin_locked',
      'pin_reset',
      'recovery_used',
      'recovery_regenerated',
      'reauthenticated',
      'token_created',
      'token_revoked',
    ],
  }).notNull(),
  ip: inet('ip'),
  userAgent: text('user_agent'),
  metadata: jsonb('metadata').$type<Record<string, string | number | boolean | null>>().notNull().default({}),
});

/** Supported currencies (`currencies`, global catalogue). */
export const currencies = pgTable('currencies', {
  code: char('code', { length: 3 }).primaryKey(),
  minorUnit: smallint('minor_unit').notNull(),
  nameIt: text('name_it').notNull(),
  nameEn: text('name_en').notNull(),
});
