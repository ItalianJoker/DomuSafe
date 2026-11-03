import {
  authUsers,
  families,
  houses,
  keyScopes,
  membershipHouses,
  membershipResidents,
  memberships,
  premiumTrials,
  scopeKeyGrants,
  type Transaction,
} from '@domusafe/db';
import { and, asc, count, eq, inArray, isNull, sql } from 'drizzle-orm';

/** Family row. */
export type FamilyRow = typeof families.$inferSelect;
/** House row. */
export type HouseRow = typeof houses.$inferSelect;
/** Membership row with the member's display name and assigned scopes. */
export interface MemberRow {
  readonly membership: typeof memberships.$inferSelect;
  readonly displayName: string;
  readonly houseIds: string[];
  readonly residentIds: string[];
}
/** Premium trial window. */
export interface TrialRow {
  readonly startedAt: Date;
  readonly endsAt: Date;
}

/**
 * Creates a family and its owner membership through `app.create_family`.
 *
 * @param tx - Transaction with an account principal.
 * @param input - Name, time zone, base currency and locale.
 * @returns The new family id.
 */
export async function createFamily(
  tx: Transaction,
  input: { name: string; timezone: string; baseCurrency: string; locale: string },
): Promise<string> {
  const result = await tx.execute<{ id: string }>(
    sql`select app.create_family(${input.name}, ${input.timezone}, ${input.baseCurrency}, ${input.locale}) as id`,
  );
  const id = result.rows[0]?.id;
  if (id === undefined) {
    throw new Error('app.create_family returned no id');
  }
  return id;
}

/**
 * Reads a family visible to the transaction principal.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @returns The row, or `null` when absent, deleted or not visible.
 */
export async function findFamily(tx: Transaction, familyId: string): Promise<FamilyRow | null> {
  const [row] = await tx
    .select()
    .from(families)
    .where(and(eq(families.id, familyId), isNull(families.deletedAt)));
  return row ?? null;
}

/**
 * Lists the active families of an account with its role in each.
 *
 * @param tx - Transaction with the account principal and no family context.
 * @param accountId - Account id.
 * @returns Families ordered by name.
 */
export async function listAccountFamilies(
  tx: Transaction,
  accountId: string,
): Promise<{ family: FamilyRow; membership: typeof memberships.$inferSelect }[]> {
  return tx
    .select({ family: families, membership: memberships })
    .from(memberships)
    .innerJoin(families, eq(families.id, memberships.familyId))
    .where(
      and(
        eq(memberships.accountId, accountId),
        eq(memberships.status, 'active'),
        isNull(families.deletedAt),
        sql`(${memberships.expiresAt} is null or ${memberships.expiresAt} > now())`,
      ),
    )
    .orderBy(asc(families.name), asc(families.id));
}

/**
 * Reads the trial of the family owner applied to this family.
 *
 * @param tx - Transaction with the family context.
 * @param familyId - Family id.
 * @param ownerAccountId - Current owner.
 * @returns The trial window, or `null`.
 */
export async function findOwnerTrial(
  tx: Transaction,
  familyId: string,
  ownerAccountId: string,
): Promise<TrialRow | null> {
  const [row] = await tx
    .select({ startedAt: premiumTrials.startedAt, endsAt: premiumTrials.endsAt })
    .from(premiumTrials)
    .where(and(eq(premiumTrials.familyId, familyId), eq(premiumTrials.accountId, ownerAccountId)));
  return row ?? null;
}

/**
 * Reads the active membership of an account in a family.
 *
 * @param tx - Transaction with the account principal and family context.
 * @param familyId - Family id.
 * @param accountId - Account id.
 * @returns The membership, or `null`.
 */
export async function findActiveMembership(
  tx: Transaction,
  familyId: string,
  accountId: string,
): Promise<typeof memberships.$inferSelect | null> {
  const [row] = await tx
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.familyId, familyId),
        eq(memberships.accountId, accountId),
        eq(memberships.status, 'active'),
        sql`(${memberships.expiresAt} is null or ${memberships.expiresAt} > now())`,
      ),
    );
  return row ?? null;
}

/**
 * Updates a family when its version matches.
 *
 * @param tx - Transaction with the family context.
 * @param familyId - Family id.
 * @param expectedVersion - Version from `If-Match`.
 * @param patch - Columns to change.
 * @returns The updated row, or `null` when the version differs or the row is not visible.
 */
export async function updateFamily(
  tx: Transaction,
  familyId: string,
  expectedVersion: number,
  patch: Partial<Pick<FamilyRow, 'name' | 'timezone' | 'baseCurrency' | 'locale'>>,
): Promise<FamilyRow | null> {
  const [row] = await tx
    .update(families)
    .set({ ...patch, version: sql`${families.version} + 1` })
    .where(and(eq(families.id, familyId), eq(families.version, expectedVersion), isNull(families.deletedAt)))
    .returning();
  return row ?? null;
}

/**
 * Locks the family row for the rest of the transaction (plan-limit checks against concurrent creations).
 *
 * @param tx - Transaction with an administrator context.
 * @param familyId - Family id.
 * @returns The locked row, or `null` when not visible.
 */
export async function lockFamily(tx: Transaction, familyId: string): Promise<FamilyRow | null> {
  const [row] = await tx.select().from(families).where(eq(families.id, familyId)).for('update');
  return row ?? null;
}

/**
 * Counts houses that count against the plan limit (active and not locked by a downgrade).
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @returns Number of houses.
 */
export async function countActiveHouses(tx: Transaction, familyId: string): Promise<number> {
  const [row] = await tx
    .select({ value: count() })
    .from(houses)
    .where(and(eq(houses.familyId, familyId), isNull(houses.deletedAt), isNull(houses.planLockedAt)));
  return row?.value ?? 0;
}

/**
 * Inserts a house.
 *
 * @param tx - Transaction with an administrator context.
 * @param values - Insert values.
 * @returns The new row.
 */
export async function insertHouse(tx: Transaction, values: typeof houses.$inferInsert): Promise<HouseRow> {
  const [row] = await tx.insert(houses).values(values).returning();
  if (row === undefined) {
    throw new Error('House insert returned no row');
  }
  return row;
}

/**
 * Lists visible houses with keyset pagination on `(sort_order, id)`.
 *
 * @param tx - Transaction with the family context (RLS applies house scope).
 * @param familyId - Family id.
 * @param page - Limit and position after which to continue.
 * @returns Up to `limit + 1` rows (the extra row signals another page).
 */
export async function listHouses(
  tx: Transaction,
  familyId: string,
  page: { limit: number; after: readonly [number, string] | null },
): Promise<HouseRow[]> {
  const after =
    page.after === null
      ? undefined
      : sql`(${houses.sortOrder}, ${houses.id}) > (${page.after[0]}, ${page.after[1]})`;
  return tx
    .select()
    .from(houses)
    .where(and(eq(houses.familyId, familyId), isNull(houses.deletedAt), after))
    .orderBy(asc(houses.sortOrder), asc(houses.id))
    .limit(page.limit + 1);
}

/**
 * Reads a visible, non-deleted house.
 *
 * @param tx - Transaction with the family context.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @returns The row, or `null`.
 */
export async function findHouse(
  tx: Transaction,
  familyId: string,
  houseId: string,
): Promise<HouseRow | null> {
  const [row] = await tx
    .select()
    .from(houses)
    .where(and(eq(houses.familyId, familyId), eq(houses.id, houseId), isNull(houses.deletedAt)));
  return row ?? null;
}

/**
 * Updates a house when its version matches.
 *
 * @param tx - Transaction with an administrator context.
 * @param target - Family, house and expected version.
 * @param patch - Columns to change (`deletedAt` for soft deletion).
 * @returns The updated row, or `null` when the version differs or the row is not visible.
 */
export async function updateHouse(
  tx: Transaction,
  target: { familyId: string; houseId: string; expectedVersion: number },
  patch: Partial<typeof houses.$inferInsert>,
): Promise<HouseRow | null> {
  const [row] = await tx
    .update(houses)
    .set({ ...patch, version: sql`${houses.version} + 1` })
    .where(
      and(
        eq(houses.familyId, target.familyId),
        eq(houses.id, target.houseId),
        eq(houses.version, target.expectedVersion),
        isNull(houses.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

async function scopesOf(
  tx: Transaction,
  membershipIds: readonly string[],
): Promise<{ houses: Map<string, string[]>; residents: Map<string, string[]> }> {
  const housesByMember = new Map<string, string[]>();
  const residentsByMember = new Map<string, string[]>();
  if (membershipIds.length === 0) {
    return { houses: housesByMember, residents: residentsByMember };
  }
  const houseRows = await tx
    .select()
    .from(membershipHouses)
    .where(inArray(membershipHouses.membershipId, [...membershipIds]));
  for (const row of houseRows) {
    housesByMember.set(row.membershipId, [...(housesByMember.get(row.membershipId) ?? []), row.houseId]);
  }
  const residentRows = await tx
    .select()
    .from(membershipResidents)
    .where(inArray(membershipResidents.membershipId, [...membershipIds]));
  for (const row of residentRows) {
    residentsByMember.set(row.membershipId, [
      ...(residentsByMember.get(row.membershipId) ?? []),
      row.residentId,
    ]);
  }
  return { houses: housesByMember, residents: residentsByMember };
}

/**
 * Lists memberships of a family with keyset pagination on `(created_at, id)`.
 *
 * @param tx - Transaction with the family context.
 * @param familyId - Family id.
 * @param page - Limit and position after which to continue.
 * @returns Up to `limit + 1` members with names and scopes.
 */
export async function listMembers(
  tx: Transaction,
  familyId: string,
  page: { limit: number; after: readonly [string, string] | null },
): Promise<MemberRow[]> {
  const after =
    page.after === null
      ? undefined
      : sql`(${memberships.createdAt}, ${memberships.id}) > (${page.after[0]}::timestamptz, ${page.after[1]})`;
  const rows = await tx
    .select({ membership: memberships, displayName: authUsers.name })
    .from(memberships)
    .innerJoin(authUsers, eq(authUsers.id, memberships.accountId))
    .where(and(eq(memberships.familyId, familyId), after))
    .orderBy(asc(memberships.createdAt), asc(memberships.id))
    .limit(page.limit + 1);
  const scopes = await scopesOf(
    tx,
    rows.map((row) => row.membership.id),
  );
  return rows.map((row) => ({
    membership: row.membership,
    displayName: row.displayName,
    houseIds: scopes.houses.get(row.membership.id) ?? [],
    residentIds: scopes.residents.get(row.membership.id) ?? [],
  }));
}

/**
 * Reads one membership of a family with name and scopes.
 *
 * @param tx - Transaction with the family context.
 * @param familyId - Family id.
 * @param membershipId - Membership id.
 * @returns The member, or `null`.
 */
export async function findMember(
  tx: Transaction,
  familyId: string,
  membershipId: string,
): Promise<MemberRow | null> {
  const [row] = await tx
    .select({ membership: memberships, displayName: authUsers.name })
    .from(memberships)
    .innerJoin(authUsers, eq(authUsers.id, memberships.accountId))
    .where(and(eq(memberships.familyId, familyId), eq(memberships.id, membershipId)));
  if (row === undefined) {
    return null;
  }
  const scopes = await scopesOf(tx, [row.membership.id]);
  return {
    membership: row.membership,
    displayName: row.displayName,
    houseIds: scopes.houses.get(row.membership.id) ?? [],
    residentIds: scopes.residents.get(row.membership.id) ?? [],
  };
}

/**
 * Updates a membership when its version matches.
 *
 * @param tx - Transaction with an administrator context.
 * @param target - Family, membership and expected version.
 * @param patch - Columns to change.
 * @returns The updated row, or `null` when the version differs or the row is not visible.
 */
export async function updateMembership(
  tx: Transaction,
  target: { familyId: string; membershipId: string; expectedVersion: number },
  patch: Partial<typeof memberships.$inferInsert>,
): Promise<typeof memberships.$inferSelect | null> {
  const [row] = await tx
    .update(memberships)
    .set({ ...patch, version: sql`${memberships.version} + 1` })
    .where(
      and(
        eq(memberships.familyId, target.familyId),
        eq(memberships.id, target.membershipId),
        eq(memberships.version, target.expectedVersion),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Replaces the house and resident scopes of a membership.
 *
 * @param tx - Transaction with an administrator context.
 * @param input - Family, membership and the complete new id lists (`null` leaves a list unchanged).
 */
export async function replaceMembershipScopes(
  tx: Transaction,
  input: {
    familyId: string;
    membershipId: string;
    houseIds: readonly string[] | null;
    residentIds: readonly string[] | null;
  },
): Promise<void> {
  if (input.houseIds !== null) {
    await tx.delete(membershipHouses).where(eq(membershipHouses.membershipId, input.membershipId));
    if (input.houseIds.length > 0) {
      await tx.insert(membershipHouses).values(
        [...new Set(input.houseIds)].map((houseId) => ({
          membershipId: input.membershipId,
          familyId: input.familyId,
          houseId,
        })),
      );
    }
  }
  if (input.residentIds !== null) {
    await tx.delete(membershipResidents).where(eq(membershipResidents.membershipId, input.membershipId));
    if (input.residentIds.length > 0) {
      await tx.insert(membershipResidents).values(
        [...new Set(input.residentIds)].map((residentId) => ({
          membershipId: input.membershipId,
          familyId: input.familyId,
          residentId,
        })),
      );
    }
  }
}

/**
 * Deletes every scope-key grant of an account in a family and flags those scopes for rotation
 * (phase 2 §8.11, step 1).
 *
 * @param tx - Transaction with an administrator context.
 * @param familyId - Family id.
 * @param accountId - Removed account.
 * @returns Number of scopes flagged for rotation.
 */
export async function revokeGrantsAndFlagRotation(
  tx: Transaction,
  familyId: string,
  accountId: string,
): Promise<number> {
  const removed = await tx
    .delete(scopeKeyGrants)
    .where(and(eq(scopeKeyGrants.familyId, familyId), eq(scopeKeyGrants.granteeAccountId, accountId)))
    .returning({ scopeId: scopeKeyGrants.scopeId });
  const scopeIds = [...new Set(removed.map((row) => row.scopeId))];
  if (scopeIds.length === 0) {
    return 0;
  }
  await tx
    .update(keyScopes)
    .set({ rotationRequiredAt: sql`now()` })
    .where(and(eq(keyScopes.familyId, familyId), inArray(keyScopes.id, scopeIds)));
  return scopeIds.length;
}
