import { sql } from 'drizzle-orm';
import { integer, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { bytea, instant } from '../columns.js';
import { actorKindEnum, revisionOpEnum, visibilityEnum } from './enums.js';

/** Metadata allowed in audit events: identifiers, versions, counts, role names, error codes. */
export type AuditMetadata = Record<string, string | number | boolean | null>;

/** Append-only audit log (partitioned monthly, 24-month retention). */
export const auditEvents = pgTable('audit_events', {
  id: uuid('id')
    .notNull()
    .default(sql`uuidv7()`),
  occurredAt: instant('occurred_at').notNull().defaultNow(),
  familyId: uuid('family_id'),
  actorKind: actorKindEnum('actor_kind').notNull(),
  actorId: uuid('actor_id'),
  action: text('action').notNull(),
  resourceType: text('resource_type'),
  resourceId: uuid('resource_id'),
  outcome: text('outcome', { enum: ['success', 'denied', 'failure'] }).notNull(),
  metadata: jsonb('metadata').$type<AuditMetadata>().notNull().default({}),
});

/** Append-only revisions of versioned resources. */
export const revisions = pgTable('revisions', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  familyId: uuid('family_id').notNull(),
  houseId: uuid('house_id'),
  residentId: uuid('resident_id'),
  visibility: visibilityEnum('visibility').notNull().default('family'),
  ownerAccountId: uuid('owner_account_id'),
  resourceType: text('resource_type').notNull(),
  resourceId: uuid('resource_id').notNull(),
  version: integer('version').notNull(),
  op: revisionOpEnum('op').notNull(),
  actorKind: actorKindEnum('actor_kind').notNull(),
  actorId: uuid('actor_id'),
  data: jsonb('data').$type<Record<string, unknown>>(),
  encScopeId: uuid('enc_scope_id'),
  encKeyVersion: integer('enc_key_version'),
  encDek: bytea('enc_dek'),
  encPayload: bytea('enc_payload'),
  createdAt: instant('created_at').notNull().defaultNow(),
});
