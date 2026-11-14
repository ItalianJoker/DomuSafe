import { and, desc, eq, gte, lt, lte, or, type SQL } from 'drizzle-orm';
import { auditEvents, revisions, type AuditMetadata, type Transaction } from '@domusafe/db';

/** Revision row as stored. */
export interface RevisionRow {
  readonly id: string;
  readonly familyId: string;
  readonly houseId: string | null;
  readonly residentId: string | null;
  readonly visibility: 'family' | 'personal';
  readonly ownerAccountId: string | null;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly version: number;
  readonly op: 'create' | 'update' | 'delete' | 'restore';
  readonly actorKind: 'account' | 'kiosk' | 'integration' | 'system' | 'anonymous';
  readonly actorId: string | null;
  readonly data: Record<string, unknown> | null;
  readonly encScopeId: string | null;
  readonly encKeyVersion: number | null;
  readonly encDek: Uint8Array<ArrayBuffer> | null;
  readonly encPayload: Uint8Array<ArrayBuffer> | null;
  readonly createdAt: Date;
}

/** Audit event row as stored. */
export interface AuditEventRow {
  readonly id: string;
  readonly occurredAt: Date;
  readonly familyId: string | null;
  readonly actorKind: 'account' | 'kiosk' | 'integration' | 'system' | 'anonymous';
  readonly actorId: string | null;
  readonly action: string;
  readonly resourceType: string | null;
  readonly resourceId: string | null;
  readonly outcome: 'success' | 'denied' | 'failure';
  readonly metadata: AuditMetadata;
}

/**
 * Lists revisions of one resource, newest first.
 *
 * Preconditions: the transaction has the family context; RLS still filters personal/house/resident rows.
 * Postconditions: at most `limit` rows; the next page starts after the last returned pair.
 * Data contract: includes the class C snapshot; class A/B ciphertext stays in envelope columns.
 *
 * @param tx - Transaction.
 * @param input - Family, resource and page.
 * @returns Rows.
 */
export async function listRevisions(
  tx: Transaction,
  input: {
    readonly familyId: string;
    readonly resourceType: string;
    readonly resourceId: string;
    readonly limit: number;
    readonly after: readonly [number, string] | null;
  },
): Promise<RevisionRow[]> {
  const filters: SQL[] = [
    eq(revisions.familyId, input.familyId),
    eq(revisions.resourceType, input.resourceType),
    eq(revisions.resourceId, input.resourceId),
  ];
  if (input.after !== null) {
    const [version, id] = input.after;
    const cursorFilter = or(
      lt(revisions.version, version),
      and(eq(revisions.version, version), lt(revisions.id, id)),
    );
    if (cursorFilter !== undefined) {
      filters.push(cursorFilter);
    }
  }
  return tx
    .select()
    .from(revisions)
    .where(and(...filters))
    .orderBy(desc(revisions.version), desc(revisions.id))
    .limit(input.limit);
}

/**
 * Loads one revision by id.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param revisionId - Revision id.
 * @returns The row, or `null`.
 */
export async function findRevision(
  tx: Transaction,
  familyId: string,
  revisionId: string,
): Promise<RevisionRow | null> {
  const [row] = await tx
    .select()
    .from(revisions)
    .where(and(eq(revisions.familyId, familyId), eq(revisions.id, revisionId)))
    .limit(1);
  return row ?? null;
}

/**
 * Lists audit events of a family, newest first.
 *
 * Preconditions: the transaction has the family context; RLS restricts the read to administrators.
 * Postconditions: at most `limit` rows.
 * Data contract: metadata holds identifiers and versions only.
 *
 * @param tx - Transaction.
 * @param input - Family, filters and page.
 * @returns Rows.
 */
export async function listAuditEvents(
  tx: Transaction,
  input: {
    readonly familyId: string;
    readonly limit: number;
    readonly after: readonly [string, string] | null;
    readonly from?: Date;
    readonly to?: Date;
    readonly action?: string;
    readonly actorId?: string;
  },
): Promise<AuditEventRow[]> {
  const filters: SQL[] = [eq(auditEvents.familyId, input.familyId)];
  if (input.from !== undefined) {
    filters.push(gte(auditEvents.occurredAt, input.from));
  }
  if (input.to !== undefined) {
    filters.push(lte(auditEvents.occurredAt, input.to));
  }
  if (input.action !== undefined) {
    filters.push(eq(auditEvents.action, input.action));
  }
  if (input.actorId !== undefined) {
    filters.push(eq(auditEvents.actorId, input.actorId));
  }
  if (input.after !== null) {
    const [occurredAt, id] = input.after;
    const cursorFilter = or(
      lt(auditEvents.occurredAt, new Date(occurredAt)),
      and(eq(auditEvents.occurredAt, new Date(occurredAt)), lt(auditEvents.id, id)),
    );
    if (cursorFilter !== undefined) {
      filters.push(cursorFilter);
    }
  }
  return tx
    .select()
    .from(auditEvents)
    .where(and(...filters))
    .orderBy(desc(auditEvents.occurredAt), desc(auditEvents.id))
    .limit(input.limit);
}
