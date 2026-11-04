import {
  contacts,
  houseGuideEntries,
  houseShutoffs,
  houses,
  keyScopes,
  maintenanceTasks,
  utilities,
  wasteCollections,
  type Transaction,
} from '@domusafe/db';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';

/** Stored class B envelope, already decoded from base64url. */
interface Envelope {
  readonly scopeId: string;
  readonly keyVersion: number;
  readonly dek: Uint8Array<ArrayBuffer>;
  readonly payload: Uint8Array<ArrayBuffer>;
}

/** Row of `house_guide_entries`. */
export type GuideEntryRow = typeof houseGuideEntries.$inferSelect;
/** Row of `house_shutoffs`. */
export type ShutoffRow = typeof houseShutoffs.$inferSelect;
/** Row of `waste_collections`. */
export type WasteRow = typeof wasteCollections.$inferSelect;
/** Row of `contacts`. */
export type ContactRow = typeof contacts.$inferSelect;
/** Row of `utilities`. */
export type UtilityRow = typeof utilities.$inferSelect;
/** Row of `maintenance_tasks`. */
export type MaintenanceRow = typeof maintenanceTasks.$inferSelect;
/** Key scope fields needed to accept an envelope. */
export interface KeyScopeRow {
  readonly id: string;
  readonly kind: string;
  readonly houseId: string | null;
  readonly currentVersion: number;
}

interface Page {
  readonly limit: number;
  readonly after: readonly [string, string] | null;
}

function envelopeInsert(envelope: Envelope | null): {
  encScopeId?: string;
  encKeyVersion?: number;
  encDek?: Uint8Array<ArrayBuffer>;
  encPayload?: Uint8Array<ArrayBuffer>;
} {
  if (envelope === null) {
    return {};
  }
  return {
    encScopeId: envelope.scopeId,
    encKeyVersion: envelope.keyVersion,
    encDek: envelope.dek,
    encPayload: envelope.payload,
  };
}

function envelopeUpdate(envelope: Envelope | null | undefined): {
  encScopeId?: string | null;
  encKeyVersion?: number | null;
  encDek?: Uint8Array<ArrayBuffer> | null;
  encPayload?: Uint8Array<ArrayBuffer> | null;
} {
  if (envelope === undefined) {
    return {};
  }
  if (envelope === null) {
    return { encScopeId: null, encKeyVersion: null, encDek: null, encPayload: null };
  }
  return envelopeInsert(envelope);
}

/**
 * Reads a house the current principal can see.
 *
 * Preconditions: the transaction has the family context.
 * Postconditions: trashed and out-of-scope houses are `null`.
 * Data contract: only the id is returned.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @returns The house id, or `null`.
 */
export async function findHouse(
  tx: Transaction,
  familyId: string,
  houseId: string,
): Promise<{ id: string } | null> {
  const [row] = await tx
    .select({ id: houses.id })
    .from(houses)
    .where(and(eq(houses.familyId, familyId), eq(houses.id, houseId), isNull(houses.deletedAt)));
  return row ?? null;
}

/**
 * Reads a key scope of the family.
 *
 * Preconditions: the transaction has the family context.
 * Postconditions: scopes of other families are `null` (RLS).
 * Data contract: kind, house and current version only.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param scopeId - Scope id.
 * @returns The scope, or `null`.
 */
export async function findKeyScope(
  tx: Transaction,
  familyId: string,
  scopeId: string,
): Promise<KeyScopeRow | null> {
  const [row] = await tx
    .select({
      id: keyScopes.id,
      kind: keyScopes.kind,
      houseId: keyScopes.houseId,
      currentVersion: keyScopes.currentVersion,
    })
    .from(keyScopes)
    .where(and(eq(keyScopes.familyId, familyId), eq(keyScopes.id, scopeId)));
  return row ?? null;
}

/**
 * Inserts a guide entry.
 *
 * Preconditions: `id` is a UUIDv7 and the house belongs to the family.
 * Postconditions: version is 1 and no secret is stored when `envelope` is null.
 * Data contract: title and body are class C; the envelope is class B.
 *
 * @param tx - Transaction.
 * @param input - Columns.
 * @returns The inserted row.
 */
export async function insertGuide(
  tx: Transaction,
  input: {
    readonly id: string;
    readonly familyId: string;
    readonly houseId: string;
    readonly audience: GuideEntryRow['audience'];
    readonly topic: GuideEntryRow['topic'];
    readonly title: string;
    readonly body: string;
    readonly sortOrder: number;
    readonly createdBy: string;
    readonly envelope: Envelope | null;
  },
): Promise<GuideEntryRow> {
  const [row] = await tx
    .insert(houseGuideEntries)
    .values({
      id: input.id,
      familyId: input.familyId,
      houseId: input.houseId,
      audience: input.audience,
      topic: input.topic,
      title: input.title,
      body: input.body,
      sortOrder: input.sortOrder,
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
      ...envelopeInsert(input.envelope),
    })
    .returning();
  if (row === undefined) {
    throw new Error('Guide entry insert returned no row');
  }
  return row;
}

/**
 * Lists guide entries of one house, oldest sort order first.
 *
 * Preconditions: the transaction has the family context.
 * Postconditions: at most `limit + 1` non-deleted rows.
 * Data contract: an audience filter is applied in SQL, then again by RLS for guests.
 *
 * @param tx - Transaction.
 * @param scope - Family, house, optional audience and page.
 * @returns Up to `limit + 1` rows.
 */
export async function listGuides(
  tx: Transaction,
  scope: {
    readonly familyId: string;
    readonly houseId: string;
    readonly audience?: GuideEntryRow['audience'];
    readonly limit: number;
    readonly after: readonly [number, string] | null;
  },
): Promise<GuideEntryRow[]> {
  const after =
    scope.after === null
      ? undefined
      : sql`(${houseGuideEntries.sortOrder}, ${houseGuideEntries.id}) > (${scope.after[0]}, ${scope.after[1]})`;
  return tx
    .select()
    .from(houseGuideEntries)
    .where(
      and(
        eq(houseGuideEntries.familyId, scope.familyId),
        eq(houseGuideEntries.houseId, scope.houseId),
        isNull(houseGuideEntries.deletedAt),
        scope.audience === undefined ? undefined : eq(houseGuideEntries.audience, scope.audience),
        after,
      ),
    )
    .orderBy(asc(houseGuideEntries.sortOrder), asc(houseGuideEntries.id))
    .limit(scope.limit + 1);
}

/**
 * Reads one non-deleted guide entry.
 *
 * Preconditions: the transaction has the family context.
 * Postconditions: hidden rows are `null`.
 * Data contract: the row includes envelope columns, which the service maps to `sealed`.
 *
 * @param tx - Transaction.
 * @param scope - Family, house and entry id.
 * @returns The row, or `null`.
 */
export async function findGuide(
  tx: Transaction,
  scope: { readonly familyId: string; readonly houseId: string; readonly entryId: string },
): Promise<GuideEntryRow | null> {
  const [row] = await tx
    .select()
    .from(houseGuideEntries)
    .where(
      and(
        eq(houseGuideEntries.familyId, scope.familyId),
        eq(houseGuideEntries.houseId, scope.houseId),
        eq(houseGuideEntries.id, scope.entryId),
        isNull(houseGuideEntries.deletedAt),
      ),
    );
  return row ?? null;
}

/**
 * Updates a guide entry when the version matches.
 *
 * Preconditions: `expectedVersion` is the version the caller read.
 * Postconditions: `null` when the version differs, the row is hidden, or RLS refuses the write.
 * Data contract: an omitted envelope leaves the secret in place; `null` clears it.
 *
 * @param tx - Transaction.
 * @param target - Family, house, entry and expected version.
 * @param patch - Columns to change.
 * @returns The updated row, or `null`.
 */
export async function updateGuide(
  tx: Transaction,
  target: {
    readonly familyId: string;
    readonly houseId: string;
    readonly entryId: string;
    readonly expectedVersion: number;
  },
  patch: {
    readonly audience?: GuideEntryRow['audience'];
    readonly topic?: GuideEntryRow['topic'];
    readonly title?: string;
    readonly body?: string;
    readonly sortOrder?: number;
    readonly deletedAt?: Date;
    readonly updatedBy: string;
    readonly envelope?: Envelope | null;
  },
): Promise<GuideEntryRow | null> {
  const [row] = await tx
    .update(houseGuideEntries)
    .set({
      ...(patch.audience === undefined ? {} : { audience: patch.audience }),
      ...(patch.topic === undefined ? {} : { topic: patch.topic }),
      ...(patch.title === undefined ? {} : { title: patch.title }),
      ...(patch.body === undefined ? {} : { body: patch.body }),
      ...(patch.sortOrder === undefined ? {} : { sortOrder: patch.sortOrder }),
      ...(patch.deletedAt === undefined ? {} : { deletedAt: patch.deletedAt }),
      updatedBy: patch.updatedBy,
      ...envelopeUpdate(patch.envelope),
      version: sql`${houseGuideEntries.version} + 1`,
    })
    .where(
      and(
        eq(houseGuideEntries.familyId, target.familyId),
        eq(houseGuideEntries.houseId, target.houseId),
        eq(houseGuideEntries.id, target.entryId),
        eq(houseGuideEntries.version, target.expectedVersion),
        isNull(houseGuideEntries.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Lists every guest-audience entry of a house for the guest projection.
 *
 * Preconditions: the transaction has the family context.
 * Postconditions: at most 200 rows, ordered by sort order.
 * Data contract: technical entries are excluded here, and again by RLS for a guest.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @returns Guest entries.
 */
export async function listGuestGuides(
  tx: Transaction,
  familyId: string,
  houseId: string,
): Promise<GuideEntryRow[]> {
  return tx
    .select()
    .from(houseGuideEntries)
    .where(
      and(
        eq(houseGuideEntries.familyId, familyId),
        eq(houseGuideEntries.houseId, houseId),
        eq(houseGuideEntries.audience, 'guest'),
        isNull(houseGuideEntries.deletedAt),
      ),
    )
    .orderBy(asc(houseGuideEntries.sortOrder), asc(houseGuideEntries.id))
    .limit(200);
}

/**
 * Inserts a cutoff.
 *
 * Preconditions: the house belongs to the family.
 * Postconditions: the new id is a server UUIDv7 and version is 1.
 * Data contract: location and instructions are class C.
 *
 * @param tx - Transaction.
 * @param input - Columns.
 * @returns The inserted row.
 */
export async function insertShutoff(
  tx: Transaction,
  input: {
    readonly familyId: string;
    readonly houseId: string;
    readonly kind: ShutoffRow['kind'];
    readonly location: string;
    readonly instructions: string;
    readonly visibleToGuests: boolean;
    readonly createdBy: string;
  },
): Promise<ShutoffRow> {
  const [row] = await tx
    .insert(houseShutoffs)
    .values({ ...input, updatedBy: input.createdBy })
    .returning();
  if (row === undefined) {
    throw new Error('Shutoff insert returned no row');
  }
  return row;
}

/**
 * Lists cutoffs of one house.
 *
 * Preconditions: the transaction has the family context.
 * Postconditions: at most `limit + 1` non-deleted rows, ordered by creation.
 * Data contract: guests only receive rows RLS marks visible.
 *
 * @param tx - Transaction.
 * @param scope - Family, house and page.
 * @returns Up to `limit + 1` rows.
 */
export async function listShutoffs(
  tx: Transaction,
  scope: { readonly familyId: string; readonly houseId: string } & Page,
): Promise<ShutoffRow[]> {
  const after =
    scope.after === null
      ? undefined
      : sql`(${houseShutoffs.createdAt}, ${houseShutoffs.id}) > (${scope.after[0]}::timestamptz, ${scope.after[1]})`;
  return tx
    .select()
    .from(houseShutoffs)
    .where(
      and(
        eq(houseShutoffs.familyId, scope.familyId),
        eq(houseShutoffs.houseId, scope.houseId),
        isNull(houseShutoffs.deletedAt),
        after,
      ),
    )
    .orderBy(asc(houseShutoffs.createdAt), asc(houseShutoffs.id))
    .limit(scope.limit + 1);
}

/**
 * Reads one cutoff.
 *
 * Preconditions: the transaction has the family context.
 * Postconditions: hidden rows are `null`.
 * Data contract: the row is class C.
 *
 * @param tx - Transaction.
 * @param scope - Family, house and cutoff id.
 * @returns The row, or `null`.
 */
export async function findShutoff(
  tx: Transaction,
  scope: { readonly familyId: string; readonly houseId: string; readonly shutoffId: string },
): Promise<ShutoffRow | null> {
  const [row] = await tx
    .select()
    .from(houseShutoffs)
    .where(
      and(
        eq(houseShutoffs.familyId, scope.familyId),
        eq(houseShutoffs.houseId, scope.houseId),
        eq(houseShutoffs.id, scope.shutoffId),
        isNull(houseShutoffs.deletedAt),
      ),
    );
  return row ?? null;
}

/**
 * Updates a cutoff when the version matches.
 *
 * Preconditions: `expectedVersion` is the version the caller read.
 * Postconditions: `null` when the write does not apply.
 * Data contract: omitted fields stay as they are.
 *
 * @param tx - Transaction.
 * @param target - Family, house, cutoff and expected version.
 * @param patch - Columns to change.
 * @returns The updated row, or `null`.
 */
export async function updateShutoff(
  tx: Transaction,
  target: {
    readonly familyId: string;
    readonly houseId: string;
    readonly shutoffId: string;
    readonly expectedVersion: number;
  },
  patch: {
    readonly kind?: ShutoffRow['kind'];
    readonly location?: string;
    readonly instructions?: string;
    readonly visibleToGuests?: boolean;
    readonly deletedAt?: Date;
    readonly updatedBy: string;
  },
): Promise<ShutoffRow | null> {
  const [row] = await tx
    .update(houseShutoffs)
    .set({
      ...(patch.kind === undefined ? {} : { kind: patch.kind }),
      ...(patch.location === undefined ? {} : { location: patch.location }),
      ...(patch.instructions === undefined ? {} : { instructions: patch.instructions }),
      ...(patch.visibleToGuests === undefined ? {} : { visibleToGuests: patch.visibleToGuests }),
      ...(patch.deletedAt === undefined ? {} : { deletedAt: patch.deletedAt }),
      updatedBy: patch.updatedBy,
      version: sql`${houseShutoffs.version} + 1`,
    })
    .where(
      and(
        eq(houseShutoffs.familyId, target.familyId),
        eq(houseShutoffs.houseId, target.houseId),
        eq(houseShutoffs.id, target.shutoffId),
        eq(houseShutoffs.version, target.expectedVersion),
        isNull(houseShutoffs.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Inserts a waste collection rule.
 *
 * Preconditions: the house belongs to the family.
 * Postconditions: version is 1.
 * Data contract: recurrence is an RFC 5545 rule or null.
 *
 * @param tx - Transaction.
 * @param input - Columns.
 * @returns The inserted row.
 */
export async function insertWaste(
  tx: Transaction,
  input: {
    readonly familyId: string;
    readonly houseId: string;
    readonly fraction: WasteRow['fraction'];
    readonly rrule: string | null;
    readonly collectionTime: string | null;
    readonly instructions: string | null;
    readonly createdBy: string;
  },
): Promise<WasteRow> {
  const [row] = await tx
    .insert(wasteCollections)
    .values({ ...input, updatedBy: input.createdBy })
    .returning();
  if (row === undefined) {
    throw new Error('Waste collection insert returned no row');
  }
  return row;
}

/**
 * Lists waste rules of one house.
 *
 * Preconditions: the transaction has the family context.
 * Postconditions: at most `limit + 1` rows.
 * Data contract: guests of the house can read every rule.
 *
 * @param tx - Transaction.
 * @param scope - Family, house and page.
 * @returns Up to `limit + 1` rows.
 */
export async function listWaste(
  tx: Transaction,
  scope: { readonly familyId: string; readonly houseId: string } & Page,
): Promise<WasteRow[]> {
  const after =
    scope.after === null
      ? undefined
      : sql`(${wasteCollections.createdAt}, ${wasteCollections.id}) > (${scope.after[0]}::timestamptz, ${scope.after[1]})`;
  return tx
    .select()
    .from(wasteCollections)
    .where(
      and(eq(wasteCollections.familyId, scope.familyId), eq(wasteCollections.houseId, scope.houseId), after),
    )
    .orderBy(asc(wasteCollections.createdAt), asc(wasteCollections.id))
    .limit(scope.limit + 1);
}

/**
 * Lists waste rules for the guest projection.
 *
 * Preconditions: the transaction has the family context.
 * Postconditions: at most 200 rows.
 * Data contract: same rows a guest of the house would list.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @returns Waste rules.
 */
export async function listGuestWaste(
  tx: Transaction,
  familyId: string,
  houseId: string,
): Promise<WasteRow[]> {
  return tx
    .select()
    .from(wasteCollections)
    .where(and(eq(wasteCollections.familyId, familyId), eq(wasteCollections.houseId, houseId)))
    .orderBy(asc(wasteCollections.createdAt), asc(wasteCollections.id))
    .limit(200);
}

/**
 * Reads one waste rule.
 *
 * Preconditions: the transaction has the family context.
 * Postconditions: hidden rows are `null`.
 * Data contract: the row is class C.
 *
 * @param tx - Transaction.
 * @param scope - Family, house and collection id.
 * @returns The row, or `null`.
 */
export async function findWaste(
  tx: Transaction,
  scope: { readonly familyId: string; readonly houseId: string; readonly collectionId: string },
): Promise<WasteRow | null> {
  const [row] = await tx
    .select()
    .from(wasteCollections)
    .where(
      and(
        eq(wasteCollections.familyId, scope.familyId),
        eq(wasteCollections.houseId, scope.houseId),
        eq(wasteCollections.id, scope.collectionId),
      ),
    );
  return row ?? null;
}

/**
 * Updates a waste rule when the version matches.
 *
 * Preconditions: `expectedVersion` is the version the caller read.
 * Postconditions: `null` when the write does not apply.
 * Data contract: `null` clears an optional column.
 *
 * @param tx - Transaction.
 * @param target - Family, house, collection and expected version.
 * @param patch - Columns to change.
 * @returns The updated row, or `null`.
 */
export async function updateWaste(
  tx: Transaction,
  target: {
    readonly familyId: string;
    readonly houseId: string;
    readonly collectionId: string;
    readonly expectedVersion: number;
  },
  patch: {
    readonly fraction?: WasteRow['fraction'];
    readonly rrule?: string | null;
    readonly collectionTime?: string | null;
    readonly instructions?: string | null;
    readonly updatedBy: string;
  },
): Promise<WasteRow | null> {
  const [row] = await tx
    .update(wasteCollections)
    .set({
      ...(patch.fraction === undefined ? {} : { fraction: patch.fraction }),
      ...(patch.rrule === undefined ? {} : { rrule: patch.rrule }),
      ...(patch.collectionTime === undefined ? {} : { collectionTime: patch.collectionTime }),
      ...(patch.instructions === undefined ? {} : { instructions: patch.instructions }),
      updatedBy: patch.updatedBy,
      version: sql`${wasteCollections.version} + 1`,
    })
    .where(
      and(
        eq(wasteCollections.familyId, target.familyId),
        eq(wasteCollections.houseId, target.houseId),
        eq(wasteCollections.id, target.collectionId),
        eq(wasteCollections.version, target.expectedVersion),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Deletes a waste rule when the version matches. The table has no trash.
 *
 * Preconditions: `expectedVersion` is the version the caller read.
 * Postconditions: `null` when the row was not deleted.
 * Data contract: the returned row is the one that was removed.
 *
 * @param tx - Transaction.
 * @param target - Family, house, collection and expected version.
 * @returns The deleted row, or `null`.
 */
export async function deleteWaste(
  tx: Transaction,
  target: {
    readonly familyId: string;
    readonly houseId: string;
    readonly collectionId: string;
    readonly expectedVersion: number;
  },
): Promise<WasteRow | null> {
  const [row] = await tx
    .delete(wasteCollections)
    .where(
      and(
        eq(wasteCollections.familyId, target.familyId),
        eq(wasteCollections.houseId, target.houseId),
        eq(wasteCollections.id, target.collectionId),
        eq(wasteCollections.version, target.expectedVersion),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Inserts a contact.
 *
 * Preconditions: a personal contact has `ownerAccountId`; a family contact does not.
 * Postconditions: version is 1.
 * Data contract: phone is E.164 or null. Notes are class C.
 *
 * @param tx - Transaction.
 * @param input - Columns.
 * @returns The inserted row.
 */
export async function insertContact(
  tx: Transaction,
  input: {
    readonly familyId: string;
    readonly visibility: ContactRow['visibility'];
    readonly ownerAccountId: string | null;
    readonly houseId: string | null;
    readonly kind: ContactRow['kind'];
    readonly trade: string | null;
    readonly displayName: string;
    readonly company: string | null;
    readonly phone: string | null;
    readonly email: string | null;
    readonly website: string | null;
    readonly address: string | null;
    readonly notes: string | null;
    readonly rating: number | null;
    readonly visibleToGuests: boolean;
    readonly createdBy: string;
  },
): Promise<ContactRow> {
  const [row] = await tx
    .insert(contacts)
    .values({ ...input, updatedBy: input.createdBy })
    .returning();
  if (row === undefined) {
    throw new Error('Contact insert returned no row');
  }
  return row;
}

/**
 * Lists contacts of a family.
 *
 * Preconditions: the transaction has the family context.
 * Postconditions: at most `limit + 1` non-deleted rows.
 * Data contract: kind and house filters are optional.
 *
 * @param tx - Transaction.
 * @param scope - Family, filters and page.
 * @returns Up to `limit + 1` rows.
 */
export async function listContacts(
  tx: Transaction,
  scope: {
    readonly familyId: string;
    readonly kind?: ContactRow['kind'];
    readonly houseId?: string;
  } & Page,
): Promise<ContactRow[]> {
  const after =
    scope.after === null
      ? undefined
      : sql`(${contacts.createdAt}, ${contacts.id}) > (${scope.after[0]}::timestamptz, ${scope.after[1]})`;
  return tx
    .select()
    .from(contacts)
    .where(
      and(
        eq(contacts.familyId, scope.familyId),
        isNull(contacts.deletedAt),
        scope.kind === undefined ? undefined : eq(contacts.kind, scope.kind),
        scope.houseId === undefined ? undefined : eq(contacts.houseId, scope.houseId),
        after,
      ),
    )
    .orderBy(asc(contacts.createdAt), asc(contacts.id))
    .limit(scope.limit + 1);
}

/**
 * Reads one contact.
 *
 * Preconditions: the transaction has the family context.
 * Postconditions: hidden rows are `null`.
 * Data contract: personal rows are visible only to their owner.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param contactId - Contact id.
 * @returns The row, or `null`.
 */
export async function findContact(
  tx: Transaction,
  familyId: string,
  contactId: string,
): Promise<ContactRow | null> {
  const [row] = await tx
    .select()
    .from(contacts)
    .where(and(eq(contacts.familyId, familyId), eq(contacts.id, contactId), isNull(contacts.deletedAt)));
  return row ?? null;
}

/**
 * Updates a contact when the version matches.
 *
 * Preconditions: personal visibility keeps an owner account.
 * Postconditions: `null` when the write does not apply.
 * Data contract: omitted fields stay as they are.
 *
 * @param tx - Transaction.
 * @param target - Family, contact and expected version.
 * @param patch - Columns to change.
 * @returns The updated row, or `null`.
 */
export async function updateContact(
  tx: Transaction,
  target: { readonly familyId: string; readonly contactId: string; readonly expectedVersion: number },
  patch: {
    readonly visibility?: ContactRow['visibility'];
    readonly ownerAccountId?: string | null;
    readonly houseId?: string | null;
    readonly kind?: ContactRow['kind'];
    readonly trade?: string | null;
    readonly displayName?: string;
    readonly company?: string | null;
    readonly phone?: string | null;
    readonly email?: string | null;
    readonly website?: string | null;
    readonly address?: string | null;
    readonly notes?: string | null;
    readonly rating?: number | null;
    readonly visibleToGuests?: boolean;
    readonly deletedAt?: Date;
    readonly updatedBy: string;
  },
): Promise<ContactRow | null> {
  const [row] = await tx
    .update(contacts)
    .set({
      ...(patch.visibility === undefined ? {} : { visibility: patch.visibility }),
      ...(patch.ownerAccountId === undefined ? {} : { ownerAccountId: patch.ownerAccountId }),
      ...(patch.houseId === undefined ? {} : { houseId: patch.houseId }),
      ...(patch.kind === undefined ? {} : { kind: patch.kind }),
      ...(patch.trade === undefined ? {} : { trade: patch.trade }),
      ...(patch.displayName === undefined ? {} : { displayName: patch.displayName }),
      ...(patch.company === undefined ? {} : { company: patch.company }),
      ...(patch.phone === undefined ? {} : { phone: patch.phone }),
      ...(patch.email === undefined ? {} : { email: patch.email }),
      ...(patch.website === undefined ? {} : { website: patch.website }),
      ...(patch.address === undefined ? {} : { address: patch.address }),
      ...(patch.notes === undefined ? {} : { notes: patch.notes }),
      ...(patch.rating === undefined ? {} : { rating: patch.rating }),
      ...(patch.visibleToGuests === undefined ? {} : { visibleToGuests: patch.visibleToGuests }),
      ...(patch.deletedAt === undefined ? {} : { deletedAt: patch.deletedAt }),
      updatedBy: patch.updatedBy,
      version: sql`${contacts.version} + 1`,
    })
    .where(
      and(
        eq(contacts.familyId, target.familyId),
        eq(contacts.id, target.contactId),
        eq(contacts.version, target.expectedVersion),
        isNull(contacts.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Inserts a utility contract.
 *
 * Preconditions: `id` is a UUIDv7 and cost columns are both set or both null.
 * Postconditions: version is 1.
 * Data contract: payment secrets live only in the envelope.
 *
 * @param tx - Transaction.
 * @param input - Columns.
 * @returns The inserted row.
 */
export async function insertUtility(
  tx: Transaction,
  input: {
    readonly id: string;
    readonly familyId: string;
    readonly houseId: string;
    readonly kind: UtilityRow['kind'];
    readonly providerName: string;
    readonly customerCode: string | null;
    readonly contractCode: string | null;
    readonly supplyPointCode: string | null;
    readonly tariffName: string | null;
    readonly startDate: string | null;
    readonly renewalDate: string | null;
    readonly billingFrequency: UtilityRow['billingFrequency'];
    readonly estimatedCostMinor: number | null;
    readonly currency: string | null;
    readonly autopay: boolean;
    readonly notes: string | null;
    readonly createdBy: string;
    readonly envelope: Envelope | null;
  },
): Promise<UtilityRow> {
  const [row] = await tx
    .insert(utilities)
    .values({
      id: input.id,
      familyId: input.familyId,
      houseId: input.houseId,
      kind: input.kind,
      providerName: input.providerName,
      customerCode: input.customerCode,
      contractCode: input.contractCode,
      supplyPointCode: input.supplyPointCode,
      tariffName: input.tariffName,
      startDate: input.startDate,
      renewalDate: input.renewalDate,
      billingFrequency: input.billingFrequency,
      estimatedCostMinor: input.estimatedCostMinor,
      currency: input.currency,
      autopay: input.autopay,
      notes: input.notes,
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
      ...envelopeInsert(input.envelope),
    })
    .returning();
  if (row === undefined) {
    throw new Error('Utility insert returned no row');
  }
  return row;
}

/**
 * Lists utilities of one house.
 *
 * Preconditions: the transaction has the family context.
 * Postconditions: at most `limit + 1` non-deleted rows. Children see none (RLS).
 * Data contract: envelope columns are included for the service to map.
 *
 * @param tx - Transaction.
 * @param scope - Family, house and page.
 * @returns Up to `limit + 1` rows.
 */
export async function listUtilities(
  tx: Transaction,
  scope: { readonly familyId: string; readonly houseId: string } & Page,
): Promise<UtilityRow[]> {
  const after =
    scope.after === null
      ? undefined
      : sql`(${utilities.createdAt}, ${utilities.id}) > (${scope.after[0]}::timestamptz, ${scope.after[1]})`;
  return tx
    .select()
    .from(utilities)
    .where(
      and(
        eq(utilities.familyId, scope.familyId),
        eq(utilities.houseId, scope.houseId),
        isNull(utilities.deletedAt),
        after,
      ),
    )
    .orderBy(asc(utilities.createdAt), asc(utilities.id))
    .limit(scope.limit + 1);
}

/**
 * Reads one utility.
 *
 * Preconditions: the transaction has the family context.
 * Postconditions: hidden rows are `null`.
 * Data contract: the row may carry an envelope.
 *
 * @param tx - Transaction.
 * @param scope - Family, house and utility id.
 * @returns The row, or `null`.
 */
export async function findUtility(
  tx: Transaction,
  scope: { readonly familyId: string; readonly houseId: string; readonly utilityId: string },
): Promise<UtilityRow | null> {
  const [row] = await tx
    .select()
    .from(utilities)
    .where(
      and(
        eq(utilities.familyId, scope.familyId),
        eq(utilities.houseId, scope.houseId),
        eq(utilities.id, scope.utilityId),
        isNull(utilities.deletedAt),
      ),
    );
  return row ?? null;
}

/**
 * Updates a utility when the version matches.
 *
 * Preconditions: cost columns stay both set or both null.
 * Postconditions: `null` when the write does not apply.
 * Data contract: an omitted envelope leaves the secret in place.
 *
 * @param tx - Transaction.
 * @param target - Family, house, utility and expected version.
 * @param patch - Columns to change.
 * @returns The updated row, or `null`.
 */
export async function updateUtility(
  tx: Transaction,
  target: {
    readonly familyId: string;
    readonly houseId: string;
    readonly utilityId: string;
    readonly expectedVersion: number;
  },
  patch: {
    readonly kind?: UtilityRow['kind'];
    readonly providerName?: string;
    readonly customerCode?: string | null;
    readonly contractCode?: string | null;
    readonly supplyPointCode?: string | null;
    readonly tariffName?: string | null;
    readonly startDate?: string | null;
    readonly renewalDate?: string | null;
    readonly billingFrequency?: UtilityRow['billingFrequency'];
    readonly estimatedCostMinor?: number | null;
    readonly currency?: string | null;
    readonly autopay?: boolean;
    readonly notes?: string | null;
    readonly deletedAt?: Date;
    readonly updatedBy: string;
    readonly envelope?: Envelope | null;
  },
): Promise<UtilityRow | null> {
  const [row] = await tx
    .update(utilities)
    .set({
      ...(patch.kind === undefined ? {} : { kind: patch.kind }),
      ...(patch.providerName === undefined ? {} : { providerName: patch.providerName }),
      ...(patch.customerCode === undefined ? {} : { customerCode: patch.customerCode }),
      ...(patch.contractCode === undefined ? {} : { contractCode: patch.contractCode }),
      ...(patch.supplyPointCode === undefined ? {} : { supplyPointCode: patch.supplyPointCode }),
      ...(patch.tariffName === undefined ? {} : { tariffName: patch.tariffName }),
      ...(patch.startDate === undefined ? {} : { startDate: patch.startDate }),
      ...(patch.renewalDate === undefined ? {} : { renewalDate: patch.renewalDate }),
      ...(patch.billingFrequency === undefined ? {} : { billingFrequency: patch.billingFrequency }),
      ...(patch.estimatedCostMinor === undefined ? {} : { estimatedCostMinor: patch.estimatedCostMinor }),
      ...(patch.currency === undefined ? {} : { currency: patch.currency }),
      ...(patch.autopay === undefined ? {} : { autopay: patch.autopay }),
      ...(patch.notes === undefined ? {} : { notes: patch.notes }),
      ...(patch.deletedAt === undefined ? {} : { deletedAt: patch.deletedAt }),
      updatedBy: patch.updatedBy,
      ...envelopeUpdate(patch.envelope),
      version: sql`${utilities.version} + 1`,
    })
    .where(
      and(
        eq(utilities.familyId, target.familyId),
        eq(utilities.houseId, target.houseId),
        eq(utilities.id, target.utilityId),
        eq(utilities.version, target.expectedVersion),
        isNull(utilities.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Inserts a maintenance task.
 *
 * Preconditions: the house belongs to the family. A contact id, when set, belongs to the family.
 * Postconditions: version is 1.
 * Data contract: the due date is a calendar date in the family time zone.
 *
 * @param tx - Transaction.
 * @param input - Columns.
 * @returns The inserted row.
 */
export async function insertMaintenance(
  tx: Transaction,
  input: {
    readonly familyId: string;
    readonly houseId: string;
    readonly contactId: string | null;
    readonly category: MaintenanceRow['category'];
    readonly priority: MaintenanceRow['priority'];
    readonly title: string;
    readonly description: string | null;
    readonly rrule: string | null;
    readonly nextDueDate: string | null;
    readonly lastDoneOn: string | null;
    readonly estimatedCostMinor: number | null;
    readonly currency: string | null;
    readonly active: boolean;
    readonly createdBy: string;
  },
): Promise<MaintenanceRow> {
  const [row] = await tx
    .insert(maintenanceTasks)
    .values({ ...input, updatedBy: input.createdBy })
    .returning();
  if (row === undefined) {
    throw new Error('Maintenance task insert returned no row');
  }
  return row;
}

/**
 * Lists maintenance tasks of one house.
 *
 * Preconditions: the transaction has the family context.
 * Postconditions: at most `limit + 1` non-deleted rows. Guests see none (RLS).
 * Data contract: an optional category filter narrows the page.
 *
 * @param tx - Transaction.
 * @param scope - Family, house, optional category and page.
 * @returns Up to `limit + 1` rows.
 */
export async function listMaintenance(
  tx: Transaction,
  scope: {
    readonly familyId: string;
    readonly houseId: string;
    readonly category?: MaintenanceRow['category'];
  } & Page,
): Promise<MaintenanceRow[]> {
  const after =
    scope.after === null
      ? undefined
      : sql`(${maintenanceTasks.createdAt}, ${maintenanceTasks.id}) > (${scope.after[0]}::timestamptz, ${scope.after[1]})`;
  return tx
    .select()
    .from(maintenanceTasks)
    .where(
      and(
        eq(maintenanceTasks.familyId, scope.familyId),
        eq(maintenanceTasks.houseId, scope.houseId),
        isNull(maintenanceTasks.deletedAt),
        scope.category === undefined ? undefined : eq(maintenanceTasks.category, scope.category),
        after,
      ),
    )
    .orderBy(asc(maintenanceTasks.createdAt), asc(maintenanceTasks.id))
    .limit(scope.limit + 1);
}

/**
 * Reads one maintenance task.
 *
 * Preconditions: the transaction has the family context.
 * Postconditions: hidden rows are `null`.
 * Data contract: the row is class C.
 *
 * @param tx - Transaction.
 * @param scope - Family, house and task id.
 * @returns The row, or `null`.
 */
export async function findMaintenance(
  tx: Transaction,
  scope: { readonly familyId: string; readonly houseId: string; readonly taskId: string },
): Promise<MaintenanceRow | null> {
  const [row] = await tx
    .select()
    .from(maintenanceTasks)
    .where(
      and(
        eq(maintenanceTasks.familyId, scope.familyId),
        eq(maintenanceTasks.houseId, scope.houseId),
        eq(maintenanceTasks.id, scope.taskId),
        isNull(maintenanceTasks.deletedAt),
      ),
    );
  return row ?? null;
}

/**
 * Updates a maintenance task when the version matches.
 *
 * Preconditions: `expectedVersion` is the version the caller read.
 * Postconditions: `null` when the write does not apply.
 * Data contract: `null` clears an optional column.
 *
 * @param tx - Transaction.
 * @param target - Family, house, task and expected version.
 * @param patch - Columns to change.
 * @returns The updated row, or `null`.
 */
export async function updateMaintenance(
  tx: Transaction,
  target: {
    readonly familyId: string;
    readonly houseId: string;
    readonly taskId: string;
    readonly expectedVersion: number;
  },
  patch: {
    readonly contactId?: string | null;
    readonly category?: MaintenanceRow['category'];
    readonly priority?: MaintenanceRow['priority'];
    readonly title?: string;
    readonly description?: string | null;
    readonly rrule?: string | null;
    readonly nextDueDate?: string | null;
    readonly lastDoneOn?: string | null;
    readonly estimatedCostMinor?: number | null;
    readonly currency?: string | null;
    readonly active?: boolean;
    readonly deletedAt?: Date;
    readonly updatedBy: string;
  },
): Promise<MaintenanceRow | null> {
  const [row] = await tx
    .update(maintenanceTasks)
    .set({
      ...(patch.contactId === undefined ? {} : { contactId: patch.contactId }),
      ...(patch.category === undefined ? {} : { category: patch.category }),
      ...(patch.priority === undefined ? {} : { priority: patch.priority }),
      ...(patch.title === undefined ? {} : { title: patch.title }),
      ...(patch.description === undefined ? {} : { description: patch.description }),
      ...(patch.rrule === undefined ? {} : { rrule: patch.rrule }),
      ...(patch.nextDueDate === undefined ? {} : { nextDueDate: patch.nextDueDate }),
      ...(patch.lastDoneOn === undefined ? {} : { lastDoneOn: patch.lastDoneOn }),
      ...(patch.estimatedCostMinor === undefined ? {} : { estimatedCostMinor: patch.estimatedCostMinor }),
      ...(patch.currency === undefined ? {} : { currency: patch.currency }),
      ...(patch.active === undefined ? {} : { active: patch.active }),
      ...(patch.deletedAt === undefined ? {} : { deletedAt: patch.deletedAt }),
      updatedBy: patch.updatedBy,
      version: sql`${maintenanceTasks.version} + 1`,
    })
    .where(
      and(
        eq(maintenanceTasks.familyId, target.familyId),
        eq(maintenanceTasks.houseId, target.houseId),
        eq(maintenanceTasks.id, target.taskId),
        eq(maintenanceTasks.version, target.expectedVersion),
        isNull(maintenanceTasks.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}
