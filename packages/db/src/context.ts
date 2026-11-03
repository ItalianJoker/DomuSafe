import { sql } from 'drizzle-orm';
import type { Database, Transaction } from './client.js';

/** Who performs a database transaction; mirrors `app.principal` (phase 2 §4.2). */
export type DbPrincipal =
  | { readonly kind: 'account'; readonly accountId: string }
  | { readonly kind: 'kiosk'; readonly kioskId: string }
  | { readonly kind: 'system' };

/** Session context applied with `SET LOCAL` at the start of every transaction. */
export interface DbContext {
  readonly principal: DbPrincipal;
  readonly familyId?: string | null;
}

/**
 * Applies the context variables to the current transaction. Only `withContext` and `setFamilyContext`
 * call this: no other code sets `app.*` variables.
 *
 * @param tx - Open transaction.
 * @param context - Principal and optional family.
 */
async function applyContext(tx: Transaction, context: DbContext): Promise<void> {
  const { principal } = context;
  const accountId = principal.kind === 'account' ? principal.accountId : '';
  const kioskId = principal.kind === 'kiosk' ? principal.kioskId : '';
  await tx.execute(sql`
    select set_config('app.principal', ${principal.kind}, true),
           set_config('app.account_id', ${accountId}, true),
           set_config('app.kiosk_id', ${kioskId}, true),
           set_config('app.family_id', ${context.familyId ?? ''}, true)
  `);
}

/**
 * Runs `work` in a transaction whose RLS context is `context`.
 *
 * Preconditions: the family membership (or kiosk/system right) was verified by the caller; RLS checks it
 * again. Postconditions: the transaction commits when `work` resolves and rolls back when it throws;
 * context variables never leak to other transactions (`SET LOCAL`).
 *
 * @param db - Database bound to the `domusafe_app` pool.
 * @param context - Principal and family of the request or job.
 * @param work - Transactional work.
 * @returns The value returned by `work`.
 */
export async function withContext<T>(
  db: Database,
  context: DbContext,
  work: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await applyContext(tx, context);
    return work(tx);
  });
}

/**
 * Switches the family of an open transaction, used right after `app.create_family` returns the new id.
 *
 * @param tx - Transaction opened by `withContext`.
 * @param principal - Principal of that transaction.
 * @param familyId - Family to act on.
 */
export async function setFamilyContext(tx: Transaction, principal: DbPrincipal, familyId: string): Promise<void> {
  await applyContext(tx, { principal, familyId });
}
