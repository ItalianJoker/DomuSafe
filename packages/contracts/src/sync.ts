import { z } from 'zod';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  instantSchema,
  pageSchema,
  sealedSchema,
  uuidSchema,
} from './common.js';

const limitField = z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE);
const cursorField = z.string().max(512).optional();
/** Class C revision snapshot: identifiers, versions, and short structural fields only. */
const revisionDataSchema = z
  .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
  .nullable();

/** WebSocket subprotocol negotiated at upgrade (phase 3 §7.1). */
export const REALTIME_SUBPROTOCOL = 'domusafe.v1';

/** Kinds of realtime notifications. Events never carry resource contents. */
export const REALTIME_EVENT_KINDS = [
  'resource.changed',
  'resource.deleted',
  'membership.changed',
  'keys.rotation_required',
  'notification.created',
  'vault.locked',
] as const;
/** A realtime event kind. */
export type RealtimeEventKind = (typeof REALTIME_EVENT_KINDS)[number];

/**
 * Events delivered on every plan. Full resource fan-out requires `realtime_sync`
 * (Premium or the one-time trial).
 */
export const REALTIME_ALWAYS_KINDS = [
  'notification.created',
  'membership.changed',
  'keys.rotation_required',
] as const satisfies readonly RealtimeEventKind[];

/** Channel names a client may subscribe to. */
export const realtimeChannelSchema = z
  .string()
  .regex(/^(family|house):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u)
  .meta({ description: 'family:<uuid> or house:<uuid>' });

/** Notification of a resource change (phase 3 §7.1). Never includes contents. */
export const realtimeEventSchema = z
  .object({
    kind: z.enum(REALTIME_EVENT_KINDS),
    resource: z
      .string()
      .regex(/^[a-z_]{2,40}$/u)
      .meta({ description: 'Resource table or logical type, e.g. house_guide_entries' }),
    id: uuidSchema,
    version: z.int().min(1).nullable(),
    houseId: uuidSchema.nullable(),
    occurredAt: instantSchema,
  })
  .strict()
  .meta({ id: 'RealtimeEvent', description: 'Resource change notification without contents' });
/** Notification of a resource change. */
export type RealtimeEvent = z.infer<typeof realtimeEventSchema>;

/** Messages the browser may send on `/ws`. */
export const realtimeClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('subscribe'), channel: realtimeChannelSchema }).strict(),
  z.object({ type: z.literal('unsubscribe'), channel: realtimeChannelSchema }).strict(),
  z.object({ type: z.literal('ping') }).strict(),
]);
/** A client → server WebSocket message. */
export type RealtimeClientMessage = z.infer<typeof realtimeClientMessageSchema>;

/** Messages the server may send on `/ws`. */
export const realtimeServerMessageSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('event'),
      channel: realtimeChannelSchema,
      event: realtimeEventSchema,
    })
    .strict(),
  z.object({ type: z.literal('session_revoked') }).strict(),
  z.object({ type: z.literal('subscribed'), channel: realtimeChannelSchema }).strict(),
  z.object({ type: z.literal('unsubscribed'), channel: realtimeChannelSchema }).strict(),
  z
    .object({
      type: z.literal('error'),
      code: z.enum(['forbidden', 'invalid_message', 'plan_required', 'unauthenticated']),
    })
    .strict(),
  z.object({ type: z.literal('pong') }).strict(),
]);
/** A server → client WebSocket message. */
export type RealtimeServerMessage = z.infer<typeof realtimeServerMessageSchema>;

/** One revision of a versioned resource (phase 2 §6.6, phase 3 §5.6). */
export const revisionSchema = z
  .object({
    id: uuidSchema,
    familyId: uuidSchema,
    houseId: uuidSchema.nullable(),
    residentId: uuidSchema.nullable(),
    visibility: z.enum(['family', 'personal']),
    ownerAccountId: uuidSchema.nullable(),
    resourceType: z.string().regex(/^[a-z_]{2,40}$/u),
    resourceId: uuidSchema,
    version: z.int().min(1),
    op: z.enum(['create', 'update', 'delete', 'restore']),
    actorKind: z.enum(['account', 'kiosk', 'integration', 'system', 'anonymous']),
    actorId: uuidSchema.nullable(),
    /** Class C snapshot. Absent for list responses when the caller only needs metadata. */
    data: revisionDataSchema.optional(),
    createdAt: instantSchema,
  })
  .strict()
  .meta({ id: 'Revision', description: 'Append-only revision of a versioned resource' });
/** One revision of a versioned resource. */
export type Revision = z.infer<typeof revisionSchema>;

/** Query of `GET /families/{f}/revisions`. */
export const revisionListQuerySchema = z
  .object({
    limit: limitField,
    cursor: cursorField,
    resourceType: z.string().regex(/^[a-z_]{2,40}$/u),
    resourceId: uuidSchema,
  })
  .strict();
/** Parsed revision list query. */
export type RevisionListQuery = z.infer<typeof revisionListQuerySchema>;

/** Response of `GET /families/{f}/revisions`. */
export const revisionListSchema = pageSchema(revisionSchema).meta({ id: 'RevisionList' });
/** Response of `GET /families/{f}/revisions`. */
export type RevisionList = z.infer<typeof revisionListSchema>;

/** Path of one revision. */
export const revisionParamsSchema = z.object({ familyId: uuidSchema, revisionId: uuidSchema }).strict();

/**
 * Body of `POST /families/{f}/revisions/{id}/restore`.
 * Class C resources restore from the stored snapshot; class A/B also require a fresh sealed envelope.
 */
export const restoreRevisionRequestSchema = z
  .object({
    sealed: sealedSchema.optional(),
  })
  .strict()
  .meta({ id: 'RestoreRevisionRequest' });
/** Body of revision restore. */
export type RestoreRevisionRequest = z.infer<typeof restoreRevisionRequestSchema>;

/** One audit event (phase 2 §6.7). Metadata never contains free text or amounts. */
export const auditEventSchema = z
  .object({
    id: uuidSchema,
    occurredAt: instantSchema,
    familyId: uuidSchema.nullable(),
    actorKind: z.enum(['account', 'kiosk', 'integration', 'system', 'anonymous']),
    actorId: uuidSchema.nullable(),
    action: z.string().regex(/^[a-z_]+(\.[a-z_]+){1,3}$/u),
    resourceType: z
      .string()
      .regex(/^[a-z_]{2,40}$/u)
      .nullable(),
    resourceId: uuidSchema.nullable(),
    outcome: z.enum(['success', 'denied', 'failure']),
    metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  })
  .strict()
  .meta({ id: 'AuditEvent', description: 'Append-only audit event without contents' });
/** One audit event. */
export type AuditEvent = z.infer<typeof auditEventSchema>;

/** Query of `GET /families/{f}/audit-events`. */
export const auditEventListQuerySchema = z
  .object({
    limit: limitField,
    cursor: cursorField,
    from: instantSchema.optional(),
    to: instantSchema.optional(),
    action: z
      .string()
      .regex(/^[a-z_]+(\.[a-z_]+){1,3}$/u)
      .optional(),
    actorId: uuidSchema.optional(),
  })
  .strict();
/** Parsed audit event list query. */
export type AuditEventListQuery = z.infer<typeof auditEventListQuerySchema>;

/** Response of `GET /families/{f}/audit-events`. */
export const auditEventListSchema = pageSchema(auditEventSchema).meta({ id: 'AuditEventList' });
/** Response of `GET /families/{f}/audit-events`. */
export type AuditEventList = z.infer<typeof auditEventListSchema>;
