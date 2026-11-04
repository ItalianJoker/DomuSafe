import { and, eq, sql } from 'drizzle-orm';
import { familyBranding, type Transaction } from '@domusafe/db';

/** Row of `family_branding`. */
export type BrandingRow = typeof familyBranding.$inferSelect;

/** Columns a save may change. The logo is a small data address, never a vault envelope. */
export interface BrandingWrite {
  readonly displayName: string | null;
  readonly accentColor: string | null;
  readonly welcome: string | null;
  readonly logoDataUrl: string | null;
}

/**
 * Reads the host mark of a family.
 *
 * @param tx - Transaction with the family context.
 * @param familyId - Family id.
 * @returns The row, or `null` when the family has not set a mark.
 */
export async function findBranding(tx: Transaction, familyId: string): Promise<BrandingRow | null> {
  const [row] = await tx.select().from(familyBranding).where(eq(familyBranding.familyId, familyId));
  return row ?? null;
}

/**
 * Inserts the first host mark.
 *
 * @param tx - Transaction with an administrator context.
 * @param familyId - Family id.
 * @param accountId - Account that writes the row.
 * @param values - Name, color, welcome sentence and logo.
 * @returns The inserted row.
 */
export async function insertBranding(
  tx: Transaction,
  familyId: string,
  accountId: string,
  values: BrandingWrite,
): Promise<BrandingRow> {
  const [row] = await tx
    .insert(familyBranding)
    .values({
      familyId,
      createdBy: accountId,
      updatedBy: accountId,
      displayName: values.displayName,
      accentColor: values.accentColor,
      welcome: values.welcome,
      logoDataUrl: values.logoDataUrl,
    })
    .returning();
  if (row === undefined) {
    throw new Error('Branding insert returned no row');
  }
  return row;
}

/**
 * Replaces the host mark when the version matches.
 *
 * @param tx - Transaction with an administrator context.
 * @param familyId - Family id.
 * @param expectedVersion - Version from `If-Match`.
 * @param accountId - Account that writes the row.
 * @param values - Name, color, welcome sentence and logo.
 * @returns The updated row, or `null` when the version differs.
 */
export async function updateBranding(
  tx: Transaction,
  familyId: string,
  expectedVersion: number,
  accountId: string,
  values: BrandingWrite,
): Promise<BrandingRow | null> {
  const [row] = await tx
    .update(familyBranding)
    .set({
      displayName: values.displayName,
      accentColor: values.accentColor,
      welcome: values.welcome,
      logoDataUrl: values.logoDataUrl,
      updatedBy: accountId,
      version: sql`${familyBranding.version} + 1`,
    })
    .where(and(eq(familyBranding.familyId, familyId), eq(familyBranding.version, expectedVersion)))
    .returning();
  return row ?? null;
}

/**
 * Removes the host mark when the version matches.
 *
 * @param tx - Transaction with an administrator context.
 * @param familyId - Family id.
 * @param expectedVersion - Version from `If-Match`.
 * @returns `true` when a row was deleted.
 */
export async function deleteBranding(
  tx: Transaction,
  familyId: string,
  expectedVersion: number,
): Promise<boolean> {
  const rows = await tx
    .delete(familyBranding)
    .where(and(eq(familyBranding.familyId, familyId), eq(familyBranding.version, expectedVersion)))
    .returning({ familyId: familyBranding.familyId });
  return rows.length > 0;
}
