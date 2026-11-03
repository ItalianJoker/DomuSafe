import { accountProfiles, authAccounts, type Database, type Transaction } from '@domusafe/db';
import { and, eq } from 'drizzle-orm';

/** Account profile row. */
export type ProfileRow = typeof accountProfiles.$inferSelect;

/**
 * Creates the profile of an account when missing.
 *
 * @param tx - Transaction with the account principal.
 * @param accountId - Account id.
 * @param displayName - Initial display name (the name given at registration).
 */
export async function ensureProfile(tx: Transaction, accountId: string, displayName: string): Promise<void> {
  await tx
    .insert(accountProfiles)
    .values({ accountId, displayName: displayName.slice(0, 80) })
    .onConflictDoNothing({ target: accountProfiles.accountId });
}

/**
 * Reads the profile of the transaction's account.
 *
 * @param tx - Transaction with the account principal.
 * @param accountId - Account id.
 * @returns The profile, or `null`.
 */
export async function findProfile(tx: Transaction, accountId: string): Promise<ProfileRow | null> {
  const [row] = await tx.select().from(accountProfiles).where(eq(accountProfiles.accountId, accountId));
  return row ?? null;
}

/**
 * Updates profile columns.
 *
 * @param tx - Transaction with the account principal.
 * @param accountId - Account id.
 * @param patch - Columns to change.
 * @returns The updated profile.
 */
export async function updateProfile(
  tx: Transaction,
  accountId: string,
  patch: Partial<Pick<ProfileRow, 'displayName' | 'locale' | 'theme' | 'lastFamilyId' | 'lastHouseId'>>,
): Promise<ProfileRow | null> {
  const [row] = await tx
    .update(accountProfiles)
    .set(patch)
    .where(eq(accountProfiles.accountId, accountId))
    .returning();
  return row ?? null;
}

/**
 * Whether the account can sign in with a password (two-factor authentication is then mandatory for
 * administration; OIDC sign-ins delegate the second factor to the identity provider).
 *
 * @param db - Database (identity tables have no RLS).
 * @param accountId - Account id.
 * @returns `true` when a `credential` provider link exists.
 */
export async function hasPasswordCredential(db: Database, accountId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: authAccounts.id })
    .from(authAccounts)
    .where(and(eq(authAccounts.userId, accountId), eq(authAccounts.providerId, 'credential')))
    .limit(1);
  return row !== undefined;
}
