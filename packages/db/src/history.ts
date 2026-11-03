import type { Transaction } from './client.js';
import { auditEvents, revisions, type AuditMetadata } from './schema/audit.js';

/** Actor recorded on revisions and audit events. */
export interface Actor {
  readonly kind: 'account' | 'kiosk' | 'integration' | 'system' | 'anonymous';
  readonly id: string | null;
}

/** One revision of a versioned resource (phase 2 §6.6). */
export interface RevisionInput {
  readonly familyId: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly version: number;
  readonly op: 'create' | 'update' | 'delete' | 'restore';
  readonly actor: Actor;
  readonly data: Record<string, unknown> | null;
  readonly houseId?: string | null;
  readonly residentId?: string | null;
  readonly ownerAccountId?: string | null;
}

/**
 * Appends a revision in the same transaction as the write it describes.
 *
 * @param tx - Transaction of the write.
 * @param input - Resource, version, operation, actor and snapshot of the class C columns.
 */
export async function recordRevision(tx: Transaction, input: RevisionInput): Promise<void> {
  await tx.insert(revisions).values({
    familyId: input.familyId,
    houseId: input.houseId ?? null,
    residentId: input.residentId ?? null,
    visibility: input.ownerAccountId ? 'personal' : 'family',
    ownerAccountId: input.ownerAccountId ?? null,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    version: input.version,
    op: input.op,
    actorKind: input.actor.kind,
    actorId: input.actor.id,
    data: input.data,
  });
}

/** One audit event (phase 2 §6.7). Metadata never contains content, amounts or free text. */
export interface AuditInput {
  readonly familyId: string | null;
  readonly actor: Actor;
  readonly action: string;
  readonly resourceType?: string;
  readonly resourceId?: string;
  readonly outcome: 'success' | 'denied' | 'failure';
  readonly metadata?: AuditMetadata;
}

/**
 * Appends an audit event in the same transaction as the action.
 *
 * @param tx - Transaction of the action.
 * @param input - Family, actor, action code (`module.resource.verb`), resource and outcome.
 */
export async function recordAudit(tx: Transaction, input: AuditInput): Promise<void> {
  await tx.insert(auditEvents).values({
    familyId: input.familyId,
    actorKind: input.actor.kind,
    actorId: input.actor.id,
    action: input.action,
    resourceType: input.resourceType ?? null,
    resourceId: input.resourceId ?? null,
    outcome: input.outcome,
    metadata: input.metadata ?? {},
  });
}
