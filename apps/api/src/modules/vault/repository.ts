import { and, desc, eq, isNull, lt, or } from 'drizzle-orm';
import {
  accountKeys,
  accountPins,
  devices,
  keyScopes,
  scopeKeyGrants,
  scopeKeyVersions,
  securityEvents,
  vaultItems,
  type Transaction,
} from '@domusafe/db';
import type { FamilyVaultSection } from '@domusafe/contracts';

/** Kinds recorded for the vault code. The code itself is never stored. */
export type PinEvent = 'pin_set' | 'pin_failed' | 'pin_locked' | 'pin_reset' | 'recovery_used';

/**
 * Reads the account key row.
 *
 * @param tx - Transaction as the account.
 * @param accountId - Account id.
 * @returns The row, or `null`.
 */
export async function findKeys(tx: Transaction, accountId: string) {
  const [row] = await tx.select().from(accountKeys).where(eq(accountKeys.accountId, accountId));
  return row ?? null;
}

/**
 * Inserts the first account key row.
 *
 * @param tx - Transaction as the account.
 * @param values - Wrapped key material. Plaintext keys are not accepted.
 */
export async function insertKeys(tx: Transaction, values: typeof accountKeys.$inferInsert): Promise<void> {
  await tx.insert(accountKeys).values(values);
}

/**
 * Reads the vault-code row and locks it for the rest of the transaction.
 *
 * @param tx - Transaction as the account.
 * @param accountId - Account id.
 * @returns The row, or `null` when the code was never set.
 */
export async function lockPin(tx: Transaction, accountId: string) {
  const [row] = await tx.select().from(accountPins).where(eq(accountPins.accountId, accountId)).for('update');
  return row ?? null;
}

/**
 * Reads the vault-code row without locking it.
 *
 * @param tx - Transaction as the account.
 * @param accountId - Account id.
 * @returns The row, or `null`.
 */
export async function findPin(tx: Transaction, accountId: string) {
  const [row] = await tx.select().from(accountPins).where(eq(accountPins.accountId, accountId));
  return row ?? null;
}

/**
 * Inserts the first vault-code row and the vault key columns.
 *
 * @param tx - Transaction as the account.
 * @param accountId - Account id.
 * @param pin - Salt, verifier hash, sealed server share and generation.
 * @param vaultKey - Public key, wrapped private key and recovery seal.
 */
export async function insertPin(
  tx: Transaction,
  accountId: string,
  pin: {
    readonly salt: Uint8Array<ArrayBuffer>;
    readonly verifierHash: string;
    readonly serverShareSealed: Uint8Array<ArrayBuffer>;
    readonly pinGeneration: number;
  },
  vaultKey: {
    readonly vaultPublicKey: Uint8Array<ArrayBuffer>;
    readonly wrappedVaultPrivateKey: Uint8Array<ArrayBuffer>;
    readonly recoverySealedVaultKey: Uint8Array<ArrayBuffer>;
  },
): Promise<void> {
  await tx.insert(accountPins).values({
    accountId,
    pinSalt: pin.salt,
    kdfMemoryKib: 65_536,
    kdfIterations: 3,
    kdfParallelism: 1,
    verifierHash: pin.verifierHash,
    serverShareSealed: pin.serverShareSealed,
    failedAttempts: 0,
    pinGeneration: pin.pinGeneration,
  });
  await tx.update(accountKeys).set(vaultKey).where(eq(accountKeys.accountId, accountId));
}

/**
 * Replaces the verifier and re-wraps the vault private key. The recovery seal is left unchanged.
 *
 * @param tx - Transaction as the account.
 * @param accountId - Account id.
 * @param pin - New salt, verifier hash, sealed share and generation.
 * @param wrappedVaultPrivateKey - Private key wrapped for the new code.
 */
export async function replacePin(
  tx: Transaction,
  accountId: string,
  pin: {
    readonly salt: Uint8Array<ArrayBuffer>;
    readonly verifierHash: string;
    readonly serverShareSealed: Uint8Array<ArrayBuffer>;
    readonly pinGeneration: number;
  },
  wrappedVaultPrivateKey: Uint8Array<ArrayBuffer>,
): Promise<void> {
  await tx
    .update(accountPins)
    .set({
      pinSalt: pin.salt,
      verifierHash: pin.verifierHash,
      serverShareSealed: pin.serverShareSealed,
      failedAttempts: 0,
      lockedAt: null,
      pinGeneration: pin.pinGeneration,
    })
    .where(eq(accountPins.accountId, accountId));
  await tx.update(accountKeys).set({ wrappedVaultPrivateKey }).where(eq(accountKeys.accountId, accountId));
}

/**
 * Records a wrong code without locking the account.
 *
 * @param tx - Transaction as the account.
 * @param accountId - Account id.
 * @param failedAttempts - New count, from 1 to 4.
 */
export async function recordFailedAttempt(
  tx: Transaction,
  accountId: string,
  failedAttempts: number,
): Promise<void> {
  await tx
    .update(accountPins)
    .set({ failedAttempts, lockedAt: null })
    .where(eq(accountPins.accountId, accountId));
}

/**
 * Locks the code after the fifth failure.
 *
 * @param tx - Transaction as the account.
 * @param accountId - Account id.
 */
export async function lockPinOut(tx: Transaction, accountId: string): Promise<void> {
  await tx
    .update(accountPins)
    .set({ failedAttempts: 5, lockedAt: new Date() })
    .where(eq(accountPins.accountId, accountId));
}

/**
 * Clears the failure counter after a correct code.
 *
 * @param tx - Transaction as the account.
 * @param accountId - Account id.
 */
export async function clearPinFailures(tx: Transaction, accountId: string): Promise<void> {
  await tx
    .update(accountPins)
    .set({ failedAttempts: 0, lockedAt: null })
    .where(eq(accountPins.accountId, accountId));
}

/**
 * Appends a security event. The metadata stays empty so the code and the phrase never land in the log.
 *
 * @param tx - Transaction as the account.
 * @param accountId - Account id.
 * @param kind - Event kind.
 * @param ip - Client address, or `null` when it is not a single IP.
 */
export async function recordPinEvent(
  tx: Transaction,
  accountId: string,
  kind: PinEvent,
  ip: string | null,
): Promise<void> {
  await tx.insert(securityEvents).values({
    accountId,
    kind,
    ip,
    metadata: {},
  });
}

/**
 * Inserts a paired device.
 *
 * @param tx - Transaction as the account.
 * @param values - Device id and the account key wrapped for that device.
 */
export async function insertDevice(tx: Transaction, values: typeof devices.$inferInsert): Promise<void> {
  await tx.insert(devices).values(values);
}

/**
 * Reads one active device of the account.
 *
 * @param tx - Transaction as the account.
 * @param accountId - Account id.
 * @param deviceId - Device id.
 * @returns The device, or `null` when it is missing or revoked.
 */
export async function findDevice(tx: Transaction, accountId: string, deviceId: string) {
  const [row] = await tx
    .select()
    .from(devices)
    .where(and(eq(devices.id, deviceId), eq(devices.accountId, accountId), isNull(devices.revokedAt)));
  return row ?? null;
}

/**
 * Reads the family vault scope.
 *
 * @param tx - Transaction in the family.
 * @param familyId - Family id.
 * @returns The scope, or `null`.
 */
export async function findVaultScope(tx: Transaction, familyId: string) {
  const [row] = await tx
    .select()
    .from(keyScopes)
    .where(and(eq(keyScopes.familyId, familyId), eq(keyScopes.kind, 'vault_family')));
  return row ?? null;
}

/**
 * Reads the caller's vault grant for a scope version.
 *
 * @param tx - Transaction in the family.
 * @param scopeId - Scope id.
 * @param version - Scope version.
 * @param accountId - Grantee account.
 * @returns The grant, or `null`.
 */
export async function findVaultGrant(tx: Transaction, scopeId: string, version: number, accountId: string) {
  const [row] = await tx
    .select()
    .from(scopeKeyGrants)
    .where(
      and(
        eq(scopeKeyGrants.scopeId, scopeId),
        eq(scopeKeyGrants.version, version),
        eq(scopeKeyGrants.grantee, 'vault'),
        eq(scopeKeyGrants.granteeAccountId, accountId),
      ),
    );
  return row ?? null;
}

/**
 * Creates the family vault scope at version 1 with one vault grant.
 *
 * @param tx - Transaction in the family.
 * @param input - Scope id chosen by the browser, family, account and grant blob.
 */
export async function insertVaultScope(
  tx: Transaction,
  input: {
    readonly scopeId: string;
    readonly familyId: string;
    readonly accountId: string;
    readonly grant: Uint8Array<ArrayBuffer>;
  },
): Promise<void> {
  await tx.insert(keyScopes).values({
    id: input.scopeId,
    familyId: input.familyId,
    kind: 'vault_family',
    currentVersion: 1,
    createdBy: input.accountId,
  });
  await tx.insert(scopeKeyVersions).values({
    scopeId: input.scopeId,
    version: 1,
    createdBy: input.accountId,
  });
  await tx.insert(scopeKeyGrants).values({
    familyId: input.familyId,
    scopeId: input.scopeId,
    version: 1,
    grantee: 'vault',
    granteeAccountId: input.accountId,
    grantBlob: input.grant,
    grantedBy: input.accountId,
  });
}

/** Filters of a vault item page. */
export interface ItemQuery {
  readonly familyId: string;
  readonly section?: FamilyVaultSection;
  readonly limit: number;
  readonly after?: { readonly updatedAt: Date; readonly id: string };
}

/**
 * Lists active vault items, newest update first.
 *
 * @param tx - Transaction in the family.
 * @param query - Family, optional section, page size and cursor.
 * @returns Up to `limit + 1` rows.
 */
export async function listItems(tx: Transaction, query: ItemQuery) {
  const filters = [
    eq(vaultItems.familyId, query.familyId),
    isNull(vaultItems.deletedAt),
    ...(query.section === undefined ? [] : [eq(vaultItems.section, query.section)]),
    ...(query.after === undefined
      ? []
      : [
          or(
            lt(vaultItems.updatedAt, query.after.updatedAt),
            and(eq(vaultItems.updatedAt, query.after.updatedAt), lt(vaultItems.id, query.after.id)),
          ),
        ]),
  ];
  return tx
    .select()
    .from(vaultItems)
    .where(and(...filters))
    .orderBy(desc(vaultItems.updatedAt), desc(vaultItems.id))
    .limit(query.limit + 1);
}

/**
 * Reads one vault item, including a trashed row.
 *
 * @param tx - Transaction in the family.
 * @param familyId - Family id.
 * @param itemId - Item id.
 * @returns The row, or `null`.
 */
export async function findItem(tx: Transaction, familyId: string, itemId: string) {
  const [row] = await tx
    .select()
    .from(vaultItems)
    .where(and(eq(vaultItems.familyId, familyId), eq(vaultItems.id, itemId)));
  return row ?? null;
}

/**
 * Inserts a ciphertext vault item.
 *
 * @param tx - Transaction in the family.
 * @param values - Identifier, section and envelope. No plaintext column exists.
 */
export async function insertItem(tx: Transaction, values: typeof vaultItems.$inferInsert): Promise<void> {
  await tx.insert(vaultItems).values(values);
}

/**
 * Replaces the envelope and bumps the version.
 *
 * @param tx - Transaction in the family.
 * @param familyId - Family id.
 * @param itemId - Item id.
 * @param values - Next version, actor and envelope.
 */
export async function updateItem(
  tx: Transaction,
  familyId: string,
  itemId: string,
  values: {
    readonly version: number;
    readonly updatedBy: string;
    readonly encScopeId: string;
    readonly encKeyVersion: number;
    readonly encDek: Uint8Array<ArrayBuffer>;
    readonly encPayload: Uint8Array<ArrayBuffer>;
    readonly deletedAt?: Date | null;
  },
): Promise<void> {
  await tx
    .update(vaultItems)
    .set(values)
    .where(and(eq(vaultItems.familyId, familyId), eq(vaultItems.id, itemId)));
}
