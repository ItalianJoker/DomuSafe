import {
  families,
  finAccounts,
  finBudgets,
  finPostings,
  finRecurring,
  finSavingsGoals,
  finSplitShares,
  finTransactions,
  fxRates,
  residents,
  type FinRecurringTemplate,
  type Transaction,
} from '@domusafe/db';
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';

/** Row of `fin_accounts`. */
export type FinAccountRow = typeof finAccounts.$inferSelect;
/** Row of `fin_transactions`. */
export type FinTransactionRow = typeof finTransactions.$inferSelect;
/** Row of `fin_postings`. */
export type FinPostingRow = typeof finPostings.$inferSelect;
/** Row of `fin_budgets`. */
export type FinBudgetRow = typeof finBudgets.$inferSelect;
/** Row of `fin_savings_goals`. */
export type FinSavingsGoalRow = typeof finSavingsGoals.$inferSelect;
/** Row of `fin_recurring`. */
export type FinRecurringRow = typeof finRecurring.$inferSelect;
/** Row of `fin_split_shares`. */
export type FinSplitShareRow = typeof finSplitShares.$inferSelect;
/** Row of `fx_rates`. */
export type FxRateRow = typeof fxRates.$inferSelect;

/** Cursor page keyed by a date/time column and id. */
interface Page {
  readonly limit: number;
  readonly after: readonly [string, string] | null;
}

/** Aggregated balance of one account in account and base currency. */
export interface AccountBalanceSum {
  readonly balanceMinor: number;
  readonly baseBalanceMinor: number;
}

/** One account's posting totals in a report window. */
export interface ReportBalanceRow {
  readonly accountId: string;
  readonly accountName: string;
  readonly accountType: FinAccountRow['type'];
  readonly currency: string;
  readonly amountMinor: number;
  readonly baseAmountMinor: number;
}

/** Income or expense aggregate in base currency. */
export interface ReportIncomeExpenseRow {
  readonly type: 'income' | 'expense';
  readonly baseAmountMinor: number;
}

/** One category account total in a report window. */
export interface ReportCategoryRow {
  readonly accountId: string;
  readonly accountName: string;
  readonly accountType: 'income' | 'expense';
  readonly baseAmountMinor: number;
}

/** Net-worth snapshot in the family base currency. */
export interface ReportNetWorth {
  readonly assetsBaseMinor: number;
  readonly liabilitiesBaseMinor: number;
  readonly netWorthBaseMinor: number;
}

/**
 * Inserts a ledger account.
 *
 * Preconditions: the transaction has family context; subtype rules (piggy bank, category) are valid.
 * Postconditions: version is 1; the row is not archived or deleted.
 * Data contract: name and type are class C; currency is an ISO code.
 *
 * @param tx - Transaction.
 * @param input - Columns.
 * @returns The inserted row.
 */
export async function insertAccount(
  tx: Transaction,
  input: {
    readonly familyId: string;
    readonly visibility: FinAccountRow['visibility'];
    readonly ownerAccountId: string | null;
    readonly residentId: string | null;
    readonly type: FinAccountRow['type'];
    readonly subtype: FinAccountRow['subtype'];
    readonly name: string;
    readonly currency: string;
    readonly parentId: string | null;
    readonly createdBy: string;
  },
): Promise<FinAccountRow> {
  const [row] = await tx
    .insert(finAccounts)
    .values({
      familyId: input.familyId,
      visibility: input.visibility,
      ownerAccountId: input.ownerAccountId,
      residentId: input.residentId,
      type: input.type,
      subtype: input.subtype,
      name: input.name,
      currency: input.currency,
      parentId: input.parentId,
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    })
    .returning();
  if (row === undefined) {
    throw new Error('Finance account insert returned no row');
  }
  return row;
}

/**
 * Loads one non-deleted ledger account.
 *
 * Preconditions: the transaction has family context.
 * Postconditions: soft-deleted accounts are `null`.
 * Data contract: full `fin_accounts` row.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param accountId - Account id.
 * @returns The row, or `null`.
 */
export async function findAccount(
  tx: Transaction,
  familyId: string,
  accountId: string,
): Promise<FinAccountRow | null> {
  const [row] = await tx
    .select()
    .from(finAccounts)
    .where(
      and(eq(finAccounts.familyId, familyId), eq(finAccounts.id, accountId), isNull(finAccounts.deletedAt)),
    );
  return row ?? null;
}

/**
 * Lists ledger accounts for a family, newest first.
 *
 * Preconditions: the transaction has family context.
 * Postconditions: at most `limit + 1` non-deleted rows; archived rows omitted unless `includeArchived`.
 * Data contract: optional type/subtype filters; cursor is `(createdAt, id)`.
 *
 * @param tx - Transaction.
 * @param scope - Family, filters and page.
 * @returns Up to `limit + 1` rows.
 */
export async function listAccounts(
  tx: Transaction,
  scope: {
    readonly familyId: string;
    readonly type?: FinAccountRow['type'] | undefined;
    readonly subtype?: FinAccountRow['subtype'] | undefined;
    readonly includeArchived?: boolean | undefined;
  } & Page,
): Promise<FinAccountRow[]> {
  const after =
    scope.after === null
      ? undefined
      : sql`(${finAccounts.createdAt}, ${finAccounts.id}) < (${scope.after[0]}::timestamptz, ${scope.after[1]})`;
  return tx
    .select()
    .from(finAccounts)
    .where(
      and(
        eq(finAccounts.familyId, scope.familyId),
        isNull(finAccounts.deletedAt),
        scope.includeArchived === true ? undefined : isNull(finAccounts.archivedAt),
        scope.type === undefined ? undefined : eq(finAccounts.type, scope.type),
        scope.subtype === undefined ? undefined : eq(finAccounts.subtype, scope.subtype),
        after,
      ),
    )
    .orderBy(desc(finAccounts.createdAt), desc(finAccounts.id))
    .limit(scope.limit + 1);
}

/**
 * Updates a ledger account when the version matches.
 *
 * Preconditions: the client loaded `expectedVersion`; the account is not deleted.
 * Postconditions: version increments by 1, or `null` on conflict / missing.
 * Data contract: name, parent, resident and archive timestamp only.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param accountId - Account id.
 * @param expectedVersion - Version the client loaded.
 * @param patch - Columns to set.
 * @returns The updated row, or `null`.
 */
export async function updateAccount(
  tx: Transaction,
  familyId: string,
  accountId: string,
  expectedVersion: number,
  patch: {
    readonly name?: string | undefined;
    readonly parentId?: string | null | undefined;
    readonly residentId?: string | null | undefined;
    readonly archivedAt?: Date | null | undefined;
    readonly updatedBy: string;
  },
): Promise<FinAccountRow | null> {
  const [row] = await tx
    .update(finAccounts)
    .set({
      ...(patch.name === undefined ? {} : { name: patch.name }),
      ...(patch.parentId === undefined ? {} : { parentId: patch.parentId }),
      ...(patch.residentId === undefined ? {} : { residentId: patch.residentId }),
      ...(patch.archivedAt === undefined ? {} : { archivedAt: patch.archivedAt }),
      updatedBy: patch.updatedBy,
      version: sql`${finAccounts.version} + 1`,
    })
    .where(
      and(
        eq(finAccounts.familyId, familyId),
        eq(finAccounts.id, accountId),
        eq(finAccounts.version, expectedVersion),
        isNull(finAccounts.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Soft-deletes a ledger account when the version matches.
 *
 * Preconditions: the client loaded `expectedVersion`; the account is not already deleted.
 * Postconditions: `deletedAt` is set and version increments, or `null` on conflict / missing.
 * Data contract: historical postings remain; the account is hidden from lists.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param accountId - Account id.
 * @param expectedVersion - Version the client loaded.
 * @param updatedBy - Actor.
 * @returns The deleted row, or `null`.
 */
export async function softDeleteAccount(
  tx: Transaction,
  familyId: string,
  accountId: string,
  expectedVersion: number,
  updatedBy: string,
): Promise<FinAccountRow | null> {
  const [row] = await tx
    .update(finAccounts)
    .set({
      deletedAt: sql`now()`,
      updatedBy,
      version: sql`${finAccounts.version} + 1`,
    })
    .where(
      and(
        eq(finAccounts.familyId, familyId),
        eq(finAccounts.id, accountId),
        eq(finAccounts.version, expectedVersion),
        isNull(finAccounts.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Sums posting amounts for one account across non-deleted transactions.
 *
 * Preconditions: the transaction has family context.
 * Postconditions: missing postings yield zeroes.
 * Data contract: `balanceMinor` is in the account currency; `baseBalanceMinor` in the family base.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param accountId - Account id.
 * @returns Aggregated balances.
 */
export async function sumAccountBalance(
  tx: Transaction,
  familyId: string,
  accountId: string,
): Promise<AccountBalanceSum> {
  const [row] = await tx
    .select({
      balanceMinor: sql<number>`coalesce(sum(${finPostings.amountMinor}), 0)`.mapWith(Number),
      baseBalanceMinor: sql<number>`coalesce(sum(${finPostings.baseAmountMinor}), 0)`.mapWith(Number),
    })
    .from(finPostings)
    .innerJoin(
      finTransactions,
      and(
        eq(finTransactions.familyId, finPostings.familyId),
        eq(finTransactions.id, finPostings.transactionId),
      ),
    )
    .where(
      and(
        eq(finPostings.familyId, familyId),
        eq(finPostings.accountId, accountId),
        isNull(finTransactions.deletedAt),
      ),
    );
  return {
    balanceMinor: row?.balanceMinor ?? 0,
    baseBalanceMinor: row?.baseBalanceMinor ?? 0,
  };
}

/**
 * Inserts a transaction header.
 *
 * Preconditions: the transaction has family context; `bookedOn` is a calendar date.
 * Postconditions: version is 1; postings must be inserted separately in the same DB transaction.
 * Data contract: description, payee, tags and notes are class C.
 *
 * @param tx - Transaction.
 * @param input - Columns.
 * @returns The inserted row.
 */
export async function insertTransaction(
  tx: Transaction,
  input: {
    readonly familyId: string;
    readonly bookedOn: string;
    readonly description: string;
    readonly payee: string | null;
    readonly status: FinTransactionRow['status'];
    readonly recurringId: string | null;
    readonly tags: readonly string[];
    readonly notes: string | null;
    readonly createdBy: string;
  },
): Promise<FinTransactionRow> {
  const [row] = await tx
    .insert(finTransactions)
    .values({
      familyId: input.familyId,
      bookedOn: input.bookedOn,
      description: input.description,
      payee: input.payee,
      status: input.status,
      recurringId: input.recurringId,
      tags: [...input.tags],
      notes: input.notes,
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    })
    .returning();
  if (row === undefined) {
    throw new Error('Finance transaction insert returned no row');
  }
  return row;
}

/**
 * Loads one non-deleted transaction header.
 *
 * Preconditions: the transaction has family context.
 * Postconditions: soft-deleted headers are `null`.
 * Data contract: header only; load postings and splits separately.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param transactionId - Transaction id.
 * @returns The row, or `null`.
 */
export async function findTransaction(
  tx: Transaction,
  familyId: string,
  transactionId: string,
): Promise<FinTransactionRow | null> {
  const [row] = await tx
    .select()
    .from(finTransactions)
    .where(
      and(
        eq(finTransactions.familyId, familyId),
        eq(finTransactions.id, transactionId),
        isNull(finTransactions.deletedAt),
      ),
    );
  return row ?? null;
}

/**
 * Lists transaction headers for a family, newest booking first.
 *
 * Preconditions: the transaction has family context.
 * Postconditions: at most `limit + 1` non-deleted rows.
 * Data contract: optional `from`/`to` on `bookedOn`; `accountId` filters via posting existence; cursor is `(bookedOn, id)`.
 *
 * @param tx - Transaction.
 * @param scope - Family, filters and page.
 * @returns Up to `limit + 1` rows.
 */
export async function listTransactions(
  tx: Transaction,
  scope: {
    readonly familyId: string;
    readonly from?: string | undefined;
    readonly to?: string | undefined;
    readonly accountId?: string | undefined;
  } & Page,
): Promise<FinTransactionRow[]> {
  const after =
    scope.after === null
      ? undefined
      : sql`(${finTransactions.bookedOn}, ${finTransactions.id}) < (${scope.after[0]}::date, ${scope.after[1]})`;
  const accountFilter =
    scope.accountId === undefined
      ? undefined
      : sql`exists (
          select 1 from ${finPostings} p
          where p.family_id = ${finTransactions.familyId}
            and p.transaction_id = ${finTransactions.id}
            and p.account_id = ${scope.accountId}
        )`;
  return tx
    .select()
    .from(finTransactions)
    .where(
      and(
        eq(finTransactions.familyId, scope.familyId),
        isNull(finTransactions.deletedAt),
        scope.from === undefined ? undefined : gte(finTransactions.bookedOn, scope.from),
        scope.to === undefined ? undefined : lte(finTransactions.bookedOn, scope.to),
        accountFilter,
        after,
      ),
    )
    .orderBy(desc(finTransactions.bookedOn), desc(finTransactions.id))
    .limit(scope.limit + 1);
}

/**
 * Updates a transaction header when the version matches.
 *
 * Preconditions: the client loaded `expectedVersion`; the header is not deleted.
 * Postconditions: version increments by 1, or `null` on conflict / missing; postings are unchanged here.
 * Data contract: header fields only.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param transactionId - Transaction id.
 * @param expectedVersion - Version the client loaded.
 * @param patch - Columns to set.
 * @returns The updated row, or `null`.
 */
export async function updateTransaction(
  tx: Transaction,
  familyId: string,
  transactionId: string,
  expectedVersion: number,
  patch: {
    readonly bookedOn?: string | undefined;
    readonly description?: string | undefined;
    readonly payee?: string | null | undefined;
    readonly status?: FinTransactionRow['status'] | undefined;
    readonly tags?: readonly string[] | undefined;
    readonly notes?: string | null | undefined;
    readonly updatedBy: string;
  },
): Promise<FinTransactionRow | null> {
  const [row] = await tx
    .update(finTransactions)
    .set({
      ...(patch.bookedOn === undefined ? {} : { bookedOn: patch.bookedOn }),
      ...(patch.description === undefined ? {} : { description: patch.description }),
      ...(patch.payee === undefined ? {} : { payee: patch.payee }),
      ...(patch.status === undefined ? {} : { status: patch.status }),
      ...(patch.tags === undefined ? {} : { tags: [...patch.tags] }),
      ...(patch.notes === undefined ? {} : { notes: patch.notes }),
      updatedBy: patch.updatedBy,
      version: sql`${finTransactions.version} + 1`,
    })
    .where(
      and(
        eq(finTransactions.familyId, familyId),
        eq(finTransactions.id, transactionId),
        eq(finTransactions.version, expectedVersion),
        isNull(finTransactions.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Soft-deletes a transaction header when the version matches.
 *
 * Preconditions: the client loaded `expectedVersion`; the header is not already deleted.
 * Postconditions: `deletedAt` is set and version increments, or `null` on conflict / missing.
 * Data contract: postings remain but are excluded from balances and reports.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param transactionId - Transaction id.
 * @param expectedVersion - Version the client loaded.
 * @param updatedBy - Actor.
 * @returns The deleted row, or `null`.
 */
export async function softDeleteTransaction(
  tx: Transaction,
  familyId: string,
  transactionId: string,
  expectedVersion: number,
  updatedBy: string,
): Promise<FinTransactionRow | null> {
  const [row] = await tx
    .update(finTransactions)
    .set({
      deletedAt: sql`now()`,
      updatedBy,
      version: sql`${finTransactions.version} + 1`,
    })
    .where(
      and(
        eq(finTransactions.familyId, familyId),
        eq(finTransactions.id, transactionId),
        eq(finTransactions.version, expectedVersion),
        isNull(finTransactions.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Hard-deletes all postings of one transaction.
 *
 * Preconditions: called inside the same DB transaction as a balanced re-insert, or before soft-delete cleanup.
 * Postconditions: no posting rows remain for the transaction.
 * Data contract: physical delete; the deferred balance trigger runs at commit.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param transactionId - Transaction id.
 */
export async function deletePostingsForTransaction(
  tx: Transaction,
  familyId: string,
  transactionId: string,
): Promise<void> {
  await tx
    .delete(finPostings)
    .where(and(eq(finPostings.familyId, familyId), eq(finPostings.transactionId, transactionId)));
}

/**
 * Inserts a batch of posting lines for one or more transactions.
 *
 * Preconditions: each posting currency matches its account; the set must balance per currency at commit.
 * Postconditions: all input rows are inserted; empty input is a no-op.
 * Data contract: amounts are signed minor units; `baseAmountMinor` is already converted.
 *
 * @param tx - Transaction.
 * @param rows - Posting columns.
 * @returns The inserted rows.
 */
export async function insertPostings(
  tx: Transaction,
  rows: readonly {
    readonly familyId: string;
    readonly transactionId: string;
    readonly accountId: string;
    readonly amountMinor: number;
    readonly currency: string;
    readonly fxRate: string;
    readonly baseAmountMinor: number;
    readonly memo: string | null;
  }[],
): Promise<FinPostingRow[]> {
  if (rows.length === 0) {
    return [];
  }
  return tx
    .insert(finPostings)
    .values(rows.map((row) => ({ ...row })))
    .returning();
}

/**
 * Loads postings for many transactions, grouped by transaction id.
 *
 * Preconditions: the transaction has family context.
 * Postconditions: missing ids yield empty arrays in the map; empty input yields an empty map.
 * Data contract: full posting rows; order is stable by transaction then id.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param transactionIds - Transaction ids.
 * @returns Map from transaction id to its postings.
 */
export async function listPostingsForTransactions(
  tx: Transaction,
  familyId: string,
  transactionIds: readonly string[],
): Promise<Map<string, FinPostingRow[]>> {
  const result = new Map<string, FinPostingRow[]>();
  if (transactionIds.length === 0) {
    return result;
  }
  for (const id of transactionIds) {
    result.set(id, []);
  }
  const rows = await tx
    .select()
    .from(finPostings)
    .where(and(eq(finPostings.familyId, familyId), inArray(finPostings.transactionId, [...transactionIds])))
    .orderBy(asc(finPostings.transactionId), asc(finPostings.id));
  for (const row of rows) {
    const bucket = result.get(row.transactionId);
    if (bucket === undefined) {
      result.set(row.transactionId, [row]);
    } else {
      bucket.push(row);
    }
  }
  return result;
}

/**
 * Hard-deletes all split shares of one transaction.
 *
 * Preconditions: called before replacing splits or when clearing them.
 * Postconditions: no split rows remain for the transaction.
 * Data contract: physical delete.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param transactionId - Transaction id.
 */
export async function deleteSplitsForTransaction(
  tx: Transaction,
  familyId: string,
  transactionId: string,
): Promise<void> {
  await tx
    .delete(finSplitShares)
    .where(and(eq(finSplitShares.familyId, familyId), eq(finSplitShares.transactionId, transactionId)));
}

/**
 * Inserts a batch of expense split shares.
 *
 * Preconditions: shares are positive; residents belong to the family.
 * Postconditions: all input rows are inserted; empty input is a no-op.
 * Data contract: `shareMinor` is in the share currency.
 *
 * @param tx - Transaction.
 * @param rows - Split columns.
 * @returns The inserted rows.
 */
export async function insertSplits(
  tx: Transaction,
  rows: readonly {
    readonly familyId: string;
    readonly transactionId: string;
    readonly residentId: string;
    readonly shareMinor: number;
    readonly currency: string;
    readonly settledTransactionId: string | null;
  }[],
): Promise<FinSplitShareRow[]> {
  if (rows.length === 0) {
    return [];
  }
  return tx
    .insert(finSplitShares)
    .values(rows.map((row) => ({ ...row })))
    .returning();
}

/**
 * Loads split shares for many transactions, grouped by transaction id.
 *
 * Preconditions: the transaction has family context.
 * Postconditions: missing ids yield empty arrays in the map; empty input yields an empty map.
 * Data contract: full split rows; order is stable by transaction then id.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param transactionIds - Transaction ids.
 * @returns Map from transaction id to its splits.
 */
export async function listSplitsForTransactions(
  tx: Transaction,
  familyId: string,
  transactionIds: readonly string[],
): Promise<Map<string, FinSplitShareRow[]>> {
  const result = new Map<string, FinSplitShareRow[]>();
  if (transactionIds.length === 0) {
    return result;
  }
  for (const id of transactionIds) {
    result.set(id, []);
  }
  const rows = await tx
    .select()
    .from(finSplitShares)
    .where(
      and(eq(finSplitShares.familyId, familyId), inArray(finSplitShares.transactionId, [...transactionIds])),
    )
    .orderBy(asc(finSplitShares.transactionId), asc(finSplitShares.id));
  for (const row of rows) {
    const bucket = result.get(row.transactionId);
    if (bucket === undefined) {
      result.set(row.transactionId, [row]);
    } else {
      bucket.push(row);
    }
  }
  return result;
}

/**
 * Inserts a budget limit.
 *
 * Preconditions: the account belongs to the family; period is monthly or yearly.
 * Postconditions: version is 1.
 * Data contract: `amountMinor` is the spending cap in the budget currency.
 *
 * @param tx - Transaction.
 * @param input - Columns.
 * @returns The inserted row.
 */
export async function insertBudget(
  tx: Transaction,
  input: {
    readonly familyId: string;
    readonly accountId: string;
    readonly period: FinBudgetRow['period'];
    readonly startsOn: string;
    readonly amountMinor: number;
    readonly currency: string;
    readonly rollover: boolean;
    readonly createdBy: string;
  },
): Promise<FinBudgetRow> {
  const [row] = await tx
    .insert(finBudgets)
    .values({
      familyId: input.familyId,
      accountId: input.accountId,
      period: input.period,
      startsOn: input.startsOn,
      amountMinor: input.amountMinor,
      currency: input.currency,
      rollover: input.rollover,
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    })
    .returning();
  if (row === undefined) {
    throw new Error('Finance budget insert returned no row');
  }
  return row;
}

/**
 * Loads one non-deleted budget.
 *
 * Preconditions: the transaction has family context.
 * Postconditions: soft-deleted budgets are `null`.
 * Data contract: full `fin_budgets` row (spent is computed separately).
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param budgetId - Budget id.
 * @returns The row, or `null`.
 */
export async function findBudget(
  tx: Transaction,
  familyId: string,
  budgetId: string,
): Promise<FinBudgetRow | null> {
  const [row] = await tx
    .select()
    .from(finBudgets)
    .where(and(eq(finBudgets.familyId, familyId), eq(finBudgets.id, budgetId), isNull(finBudgets.deletedAt)));
  return row ?? null;
}

/**
 * Lists budgets for a family, newest first.
 *
 * Preconditions: the transaction has family context.
 * Postconditions: at most `limit + 1` non-deleted rows.
 * Data contract: cursor is `(createdAt, id)`.
 *
 * @param tx - Transaction.
 * @param scope - Family and page.
 * @returns Up to `limit + 1` rows.
 */
export async function listBudgets(
  tx: Transaction,
  scope: { readonly familyId: string } & Page,
): Promise<FinBudgetRow[]> {
  const after =
    scope.after === null
      ? undefined
      : sql`(${finBudgets.createdAt}, ${finBudgets.id}) < (${scope.after[0]}::timestamptz, ${scope.after[1]})`;
  return tx
    .select()
    .from(finBudgets)
    .where(and(eq(finBudgets.familyId, scope.familyId), isNull(finBudgets.deletedAt), after))
    .orderBy(desc(finBudgets.createdAt), desc(finBudgets.id))
    .limit(scope.limit + 1);
}

/**
 * Updates a budget when the version matches.
 *
 * Preconditions: the client loaded `expectedVersion`; the budget is not deleted.
 * Postconditions: version increments by 1, or `null` on conflict / missing.
 * Data contract: amount, rollover and period start only.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param budgetId - Budget id.
 * @param expectedVersion - Version the client loaded.
 * @param patch - Columns to set.
 * @returns The updated row, or `null`.
 */
export async function updateBudget(
  tx: Transaction,
  familyId: string,
  budgetId: string,
  expectedVersion: number,
  patch: {
    readonly amountMinor?: number | undefined;
    readonly rollover?: boolean | undefined;
    readonly startsOn?: string | undefined;
    readonly updatedBy: string;
  },
): Promise<FinBudgetRow | null> {
  const [row] = await tx
    .update(finBudgets)
    .set({
      ...(patch.amountMinor === undefined ? {} : { amountMinor: patch.amountMinor }),
      ...(patch.rollover === undefined ? {} : { rollover: patch.rollover }),
      ...(patch.startsOn === undefined ? {} : { startsOn: patch.startsOn }),
      updatedBy: patch.updatedBy,
      version: sql`${finBudgets.version} + 1`,
    })
    .where(
      and(
        eq(finBudgets.familyId, familyId),
        eq(finBudgets.id, budgetId),
        eq(finBudgets.version, expectedVersion),
        isNull(finBudgets.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Soft-deletes a budget when the version matches.
 *
 * Preconditions: the client loaded `expectedVersion`; the budget is not already deleted.
 * Postconditions: `deletedAt` is set and version increments, or `null` on conflict / missing.
 * Data contract: spending history is unchanged.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param budgetId - Budget id.
 * @param expectedVersion - Version the client loaded.
 * @param updatedBy - Actor.
 * @returns The deleted row, or `null`.
 */
export async function softDeleteBudget(
  tx: Transaction,
  familyId: string,
  budgetId: string,
  expectedVersion: number,
  updatedBy: string,
): Promise<FinBudgetRow | null> {
  const [row] = await tx
    .update(finBudgets)
    .set({
      deletedAt: sql`now()`,
      updatedBy,
      version: sql`${finBudgets.version} + 1`,
    })
    .where(
      and(
        eq(finBudgets.familyId, familyId),
        eq(finBudgets.id, budgetId),
        eq(finBudgets.version, expectedVersion),
        isNull(finBudgets.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Sums positive postings on a budget account inside its period window.
 *
 * Preconditions: `startsOn` is the period start date; period is monthly or yearly.
 * Postconditions: empty activity yields 0; soft-deleted transactions are excluded.
 * Data contract: only `amount_minor > 0` postings on `accountId` with `booked_on` in
 * `[startsOn, startsOn + 1 month|year − 1 day]` are summed (account currency).
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param accountId - Category account id.
 * @param startsOn - Period start (inclusive).
 * @param period - Cadence.
 * @returns Spent amount in minor units.
 */
export async function sumSpentForBudget(
  tx: Transaction,
  familyId: string,
  accountId: string,
  startsOn: string,
  period: 'monthly' | 'yearly',
): Promise<number> {
  const withinPeriod =
    period === 'monthly'
      ? sql`${finTransactions.bookedOn} <= (${startsOn}::date + interval '1 month' - interval '1 day')`
      : sql`${finTransactions.bookedOn} <= (${startsOn}::date + interval '1 year' - interval '1 day')`;
  const [row] = await tx
    .select({
      spent: sql<number>`coalesce(sum(${finPostings.amountMinor}), 0)`.mapWith(Number),
    })
    .from(finPostings)
    .innerJoin(
      finTransactions,
      and(
        eq(finTransactions.familyId, finPostings.familyId),
        eq(finTransactions.id, finPostings.transactionId),
      ),
    )
    .where(
      and(
        eq(finPostings.familyId, familyId),
        eq(finPostings.accountId, accountId),
        isNull(finTransactions.deletedAt),
        sql`${finPostings.amountMinor} > 0`,
        gte(finTransactions.bookedOn, startsOn),
        withinPeriod,
      ),
    );
  return row?.spent ?? 0;
}

/**
 * Inserts a savings goal.
 *
 * Preconditions: the linked account is a savings or piggy-bank account.
 * Postconditions: version is 1.
 * Data contract: target is in the account currency; balance is computed separately.
 *
 * @param tx - Transaction.
 * @param input - Columns.
 * @returns The inserted row.
 */
export async function insertSavingsGoal(
  tx: Transaction,
  input: {
    readonly familyId: string;
    readonly residentId: string | null;
    readonly accountId: string;
    readonly name: string;
    readonly targetMinor: number;
    readonly targetDate: string | null;
    readonly createdBy: string;
  },
): Promise<FinSavingsGoalRow> {
  const [row] = await tx
    .insert(finSavingsGoals)
    .values({
      familyId: input.familyId,
      residentId: input.residentId,
      accountId: input.accountId,
      name: input.name,
      targetMinor: input.targetMinor,
      targetDate: input.targetDate,
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    })
    .returning();
  if (row === undefined) {
    throw new Error('Finance savings goal insert returned no row');
  }
  return row;
}

/**
 * Loads one non-deleted savings goal.
 *
 * Preconditions: the transaction has family context.
 * Postconditions: soft-deleted goals are `null`.
 * Data contract: full `fin_savings_goals` row.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param goalId - Goal id.
 * @returns The row, or `null`.
 */
export async function findSavingsGoal(
  tx: Transaction,
  familyId: string,
  goalId: string,
): Promise<FinSavingsGoalRow | null> {
  const [row] = await tx
    .select()
    .from(finSavingsGoals)
    .where(
      and(
        eq(finSavingsGoals.familyId, familyId),
        eq(finSavingsGoals.id, goalId),
        isNull(finSavingsGoals.deletedAt),
      ),
    );
  return row ?? null;
}

/**
 * Lists savings goals for a family, newest first.
 *
 * Preconditions: the transaction has family context.
 * Postconditions: at most `limit + 1` non-deleted rows.
 * Data contract: cursor is `(createdAt, id)`.
 *
 * @param tx - Transaction.
 * @param scope - Family and page.
 * @returns Up to `limit + 1` rows.
 */
export async function listSavingsGoals(
  tx: Transaction,
  scope: { readonly familyId: string } & Page,
): Promise<FinSavingsGoalRow[]> {
  const after =
    scope.after === null
      ? undefined
      : sql`(${finSavingsGoals.createdAt}, ${finSavingsGoals.id}) < (${scope.after[0]}::timestamptz, ${scope.after[1]})`;
  return tx
    .select()
    .from(finSavingsGoals)
    .where(and(eq(finSavingsGoals.familyId, scope.familyId), isNull(finSavingsGoals.deletedAt), after))
    .orderBy(desc(finSavingsGoals.createdAt), desc(finSavingsGoals.id))
    .limit(scope.limit + 1);
}

/**
 * Updates a savings goal when the version matches.
 *
 * Preconditions: the client loaded `expectedVersion`; the goal is not deleted.
 * Postconditions: version increments by 1, or `null` on conflict / missing.
 * Data contract: name, target, date and resident only.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param goalId - Goal id.
 * @param expectedVersion - Version the client loaded.
 * @param patch - Columns to set.
 * @returns The updated row, or `null`.
 */
export async function updateSavingsGoal(
  tx: Transaction,
  familyId: string,
  goalId: string,
  expectedVersion: number,
  patch: {
    readonly name?: string | undefined;
    readonly targetMinor?: number | undefined;
    readonly targetDate?: string | null | undefined;
    readonly residentId?: string | null | undefined;
    readonly updatedBy: string;
  },
): Promise<FinSavingsGoalRow | null> {
  const [row] = await tx
    .update(finSavingsGoals)
    .set({
      ...(patch.name === undefined ? {} : { name: patch.name }),
      ...(patch.targetMinor === undefined ? {} : { targetMinor: patch.targetMinor }),
      ...(patch.targetDate === undefined ? {} : { targetDate: patch.targetDate }),
      ...(patch.residentId === undefined ? {} : { residentId: patch.residentId }),
      updatedBy: patch.updatedBy,
      version: sql`${finSavingsGoals.version} + 1`,
    })
    .where(
      and(
        eq(finSavingsGoals.familyId, familyId),
        eq(finSavingsGoals.id, goalId),
        eq(finSavingsGoals.version, expectedVersion),
        isNull(finSavingsGoals.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Soft-deletes a savings goal when the version matches.
 *
 * Preconditions: the client loaded `expectedVersion`; the goal is not already deleted.
 * Postconditions: `deletedAt` is set and version increments, or `null` on conflict / missing.
 * Data contract: the linked account is unchanged.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param goalId - Goal id.
 * @param expectedVersion - Version the client loaded.
 * @param updatedBy - Actor.
 * @returns The deleted row, or `null`.
 */
export async function softDeleteSavingsGoal(
  tx: Transaction,
  familyId: string,
  goalId: string,
  expectedVersion: number,
  updatedBy: string,
): Promise<FinSavingsGoalRow | null> {
  const [row] = await tx
    .update(finSavingsGoals)
    .set({
      deletedAt: sql`now()`,
      updatedBy,
      version: sql`${finSavingsGoals.version} + 1`,
    })
    .where(
      and(
        eq(finSavingsGoals.familyId, familyId),
        eq(finSavingsGoals.id, goalId),
        eq(finSavingsGoals.version, expectedVersion),
        isNull(finSavingsGoals.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Inserts a recurring transaction template.
 *
 * Preconditions: the template postings are balanced per currency (validated by the service).
 * Postconditions: version is 1; `active` defaults are applied by the caller.
 * Data contract: `template` is `FinRecurringTemplate` JSON; `rrule` is a recurrence rule.
 *
 * @param tx - Transaction.
 * @param input - Columns.
 * @returns The inserted row.
 */
export async function insertRecurring(
  tx: Transaction,
  input: {
    readonly familyId: string;
    readonly description: string;
    readonly rrule: string;
    readonly nextRunOn: string;
    readonly endOn: string | null;
    readonly template: FinRecurringTemplate;
    readonly autoPost: boolean;
    readonly active: boolean;
    readonly createdBy: string;
  },
): Promise<FinRecurringRow> {
  const [row] = await tx
    .insert(finRecurring)
    .values({
      familyId: input.familyId,
      description: input.description,
      rrule: input.rrule,
      nextRunOn: input.nextRunOn,
      endOn: input.endOn,
      template: input.template,
      autoPost: input.autoPost,
      active: input.active,
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    })
    .returning();
  if (row === undefined) {
    throw new Error('Finance recurring insert returned no row');
  }
  return row;
}

/**
 * Loads one non-deleted recurring template.
 *
 * Preconditions: the transaction has family context.
 * Postconditions: soft-deleted rows are `null`.
 * Data contract: full `fin_recurring` row including template JSON.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param recurringId - Recurring id.
 * @returns The row, or `null`.
 */
export async function findRecurring(
  tx: Transaction,
  familyId: string,
  recurringId: string,
): Promise<FinRecurringRow | null> {
  const [row] = await tx
    .select()
    .from(finRecurring)
    .where(
      and(
        eq(finRecurring.familyId, familyId),
        eq(finRecurring.id, recurringId),
        isNull(finRecurring.deletedAt),
      ),
    );
  return row ?? null;
}

/**
 * Lists recurring templates for a family, newest first.
 *
 * Preconditions: the transaction has family context.
 * Postconditions: at most `limit + 1` non-deleted rows.
 * Data contract: cursor is `(createdAt, id)`.
 *
 * @param tx - Transaction.
 * @param scope - Family and page.
 * @returns Up to `limit + 1` rows.
 */
export async function listRecurring(
  tx: Transaction,
  scope: { readonly familyId: string } & Page,
): Promise<FinRecurringRow[]> {
  const after =
    scope.after === null
      ? undefined
      : sql`(${finRecurring.createdAt}, ${finRecurring.id}) < (${scope.after[0]}::timestamptz, ${scope.after[1]})`;
  return tx
    .select()
    .from(finRecurring)
    .where(and(eq(finRecurring.familyId, scope.familyId), isNull(finRecurring.deletedAt), after))
    .orderBy(desc(finRecurring.createdAt), desc(finRecurring.id))
    .limit(scope.limit + 1);
}

/**
 * Updates a recurring template when the version matches.
 *
 * Preconditions: the client loaded `expectedVersion`; the row is not deleted.
 * Postconditions: version increments by 1, or `null` on conflict / missing.
 * Data contract: schedule, template body and active flags.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param recurringId - Recurring id.
 * @param expectedVersion - Version the client loaded.
 * @param patch - Columns to set.
 * @returns The updated row, or `null`.
 */
export async function updateRecurring(
  tx: Transaction,
  familyId: string,
  recurringId: string,
  expectedVersion: number,
  patch: {
    readonly description?: string | undefined;
    readonly rrule?: string | undefined;
    readonly nextRunOn?: string | undefined;
    readonly endOn?: string | null | undefined;
    readonly template?: FinRecurringTemplate | undefined;
    readonly autoPost?: boolean | undefined;
    readonly active?: boolean | undefined;
    readonly updatedBy: string;
  },
): Promise<FinRecurringRow | null> {
  const [row] = await tx
    .update(finRecurring)
    .set({
      ...(patch.description === undefined ? {} : { description: patch.description }),
      ...(patch.rrule === undefined ? {} : { rrule: patch.rrule }),
      ...(patch.nextRunOn === undefined ? {} : { nextRunOn: patch.nextRunOn }),
      ...(patch.endOn === undefined ? {} : { endOn: patch.endOn }),
      ...(patch.template === undefined ? {} : { template: patch.template }),
      ...(patch.autoPost === undefined ? {} : { autoPost: patch.autoPost }),
      ...(patch.active === undefined ? {} : { active: patch.active }),
      updatedBy: patch.updatedBy,
      version: sql`${finRecurring.version} + 1`,
    })
    .where(
      and(
        eq(finRecurring.familyId, familyId),
        eq(finRecurring.id, recurringId),
        eq(finRecurring.version, expectedVersion),
        isNull(finRecurring.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Soft-deletes a recurring template when the version matches.
 *
 * Preconditions: the client loaded `expectedVersion`; the row is not already deleted.
 * Postconditions: `deletedAt` is set and version increments, or `null` on conflict / missing.
 * Data contract: already materialised transactions are unchanged.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param recurringId - Recurring id.
 * @param expectedVersion - Version the client loaded.
 * @param updatedBy - Actor.
 * @returns The deleted row, or `null`.
 */
export async function softDeleteRecurring(
  tx: Transaction,
  familyId: string,
  recurringId: string,
  expectedVersion: number,
  updatedBy: string,
): Promise<FinRecurringRow | null> {
  const [row] = await tx
    .update(finRecurring)
    .set({
      deletedAt: sql`now()`,
      updatedBy,
      version: sql`${finRecurring.version} + 1`,
    })
    .where(
      and(
        eq(finRecurring.familyId, familyId),
        eq(finRecurring.id, recurringId),
        eq(finRecurring.version, expectedVersion),
        isNull(finRecurring.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Lists foreign-exchange reference rates, newest date first.
 *
 * Preconditions: none (global catalogue; not tenant-scoped).
 * Postconditions: at most `limit + 1` rows.
 * Data contract: optional exact `quote` and `on` date; cursor is `(rateDate, quote)`.
 *
 * @param tx - Transaction.
 * @param scope - Filters and page.
 * @returns Up to `limit + 1` rows.
 */
export async function listFxRates(
  tx: Transaction,
  scope: {
    readonly quote?: string | undefined;
    readonly on?: string | undefined;
    readonly limit: number;
    readonly after: readonly [string, string] | null;
  },
): Promise<FxRateRow[]> {
  const after =
    scope.after === null
      ? undefined
      : sql`(${fxRates.rateDate}, ${fxRates.quote}) < (${scope.after[0]}::date, ${scope.after[1]})`;
  return tx
    .select()
    .from(fxRates)
    .where(
      and(
        scope.quote === undefined ? undefined : eq(fxRates.quote, scope.quote),
        scope.on === undefined ? undefined : eq(fxRates.rateDate, scope.on),
        after,
      ),
    )
    .orderBy(desc(fxRates.rateDate), desc(fxRates.quote))
    .limit(scope.limit + 1);
}

/**
 * Finds the latest FX rate for a pair on or before a date.
 *
 * Preconditions: `base` and `quote` are ISO currency codes.
 * Postconditions: no matching row yields `null`.
 * Data contract: the most recent `rate_date <= onOrBefore` for the pair.
 *
 * @param tx - Transaction.
 * @param base - Base currency.
 * @param quote - Quote currency.
 * @param onOrBefore - Inclusive calendar date.
 * @returns The rate row, or `null`.
 */
export async function findFxRate(
  tx: Transaction,
  base: string,
  quote: string,
  onOrBefore: string,
): Promise<FxRateRow | null> {
  const [row] = await tx
    .select()
    .from(fxRates)
    .where(and(eq(fxRates.base, base), eq(fxRates.quote, quote), lte(fxRates.rateDate, onOrBefore)))
    .orderBy(desc(fxRates.rateDate))
    .limit(1);
  return row ?? null;
}

/**
 * Reports per-account posting totals in a booking-date window.
 *
 * Preconditions: `from` and `to` are inclusive calendar dates.
 * Postconditions: accounts with no activity in range are omitted; soft-deleted transactions are excluded.
 * Data contract: amounts are summed in account and base currency; joined to account metadata.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param from - Range start.
 * @param to - Range end.
 * @returns One row per active account with activity.
 */
export async function reportBalances(
  tx: Transaction,
  familyId: string,
  from: string,
  to: string,
): Promise<ReportBalanceRow[]> {
  return tx
    .select({
      accountId: finAccounts.id,
      accountName: finAccounts.name,
      accountType: finAccounts.type,
      currency: finAccounts.currency,
      amountMinor: sql<number>`coalesce(sum(${finPostings.amountMinor}), 0)`.mapWith(Number),
      baseAmountMinor: sql<number>`coalesce(sum(${finPostings.baseAmountMinor}), 0)`.mapWith(Number),
    })
    .from(finPostings)
    .innerJoin(
      finTransactions,
      and(
        eq(finTransactions.familyId, finPostings.familyId),
        eq(finTransactions.id, finPostings.transactionId),
      ),
    )
    .innerJoin(
      finAccounts,
      and(eq(finAccounts.familyId, finPostings.familyId), eq(finAccounts.id, finPostings.accountId)),
    )
    .where(
      and(
        eq(finPostings.familyId, familyId),
        isNull(finTransactions.deletedAt),
        isNull(finAccounts.deletedAt),
        gte(finTransactions.bookedOn, from),
        lte(finTransactions.bookedOn, to),
      ),
    )
    .groupBy(finAccounts.id, finAccounts.name, finAccounts.type, finAccounts.currency)
    .orderBy(asc(finAccounts.name), asc(finAccounts.id));
}

/**
 * Reports aggregated income versus expense in base currency.
 *
 * Preconditions: `from` and `to` are inclusive calendar dates.
 * Postconditions: types with no activity may be absent; soft-deleted transactions are excluded.
 * Data contract: sums `base_amount_minor` grouped by account type `income` | `expense`.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param from - Range start.
 * @param to - Range end.
 * @returns Zero, one or two aggregate rows.
 */
export async function reportIncomeExpense(
  tx: Transaction,
  familyId: string,
  from: string,
  to: string,
): Promise<ReportIncomeExpenseRow[]> {
  const rows = await tx
    .select({
      type: finAccounts.type,
      baseAmountMinor: sql<number>`coalesce(sum(${finPostings.baseAmountMinor}), 0)`.mapWith(Number),
    })
    .from(finPostings)
    .innerJoin(
      finTransactions,
      and(
        eq(finTransactions.familyId, finPostings.familyId),
        eq(finTransactions.id, finPostings.transactionId),
      ),
    )
    .innerJoin(
      finAccounts,
      and(eq(finAccounts.familyId, finPostings.familyId), eq(finAccounts.id, finPostings.accountId)),
    )
    .where(
      and(
        eq(finPostings.familyId, familyId),
        isNull(finTransactions.deletedAt),
        isNull(finAccounts.deletedAt),
        inArray(finAccounts.type, ['income', 'expense']),
        gte(finTransactions.bookedOn, from),
        lte(finTransactions.bookedOn, to),
      ),
    )
    .groupBy(finAccounts.type)
    .orderBy(asc(finAccounts.type));
  return rows.map((row) => ({
    type: row.type as 'income' | 'expense',
    baseAmountMinor: row.baseAmountMinor,
  }));
}

/**
 * Reports totals by income/expense category accounts.
 *
 * Preconditions: `from` and `to` are inclusive calendar dates.
 * Postconditions: only subtype `category` accounts appear; soft-deleted rows are excluded.
 * Data contract: sums `base_amount_minor` per category account.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param from - Range start.
 * @param to - Range end.
 * @returns One row per category with activity.
 */
export async function reportByCategory(
  tx: Transaction,
  familyId: string,
  from: string,
  to: string,
): Promise<ReportCategoryRow[]> {
  const rows = await tx
    .select({
      accountId: finAccounts.id,
      accountName: finAccounts.name,
      accountType: finAccounts.type,
      baseAmountMinor: sql<number>`coalesce(sum(${finPostings.baseAmountMinor}), 0)`.mapWith(Number),
    })
    .from(finPostings)
    .innerJoin(
      finTransactions,
      and(
        eq(finTransactions.familyId, finPostings.familyId),
        eq(finTransactions.id, finPostings.transactionId),
      ),
    )
    .innerJoin(
      finAccounts,
      and(eq(finAccounts.familyId, finPostings.familyId), eq(finAccounts.id, finPostings.accountId)),
    )
    .where(
      and(
        eq(finPostings.familyId, familyId),
        isNull(finTransactions.deletedAt),
        isNull(finAccounts.deletedAt),
        eq(finAccounts.subtype, 'category'),
        inArray(finAccounts.type, ['income', 'expense']),
        gte(finTransactions.bookedOn, from),
        lte(finTransactions.bookedOn, to),
      ),
    )
    .groupBy(finAccounts.id, finAccounts.name, finAccounts.type)
    .orderBy(asc(finAccounts.type), asc(finAccounts.name), asc(finAccounts.id));
  return rows.map((row) => ({
    accountId: row.accountId,
    accountName: row.accountName,
    accountType: row.accountType as 'income' | 'expense',
    baseAmountMinor: row.baseAmountMinor,
  }));
}

/**
 * Reports net worth (assets minus liabilities) in base currency up to a date.
 *
 * Preconditions: `on` is an inclusive booking-date cutoff.
 * Postconditions: soft-deleted transactions are excluded; empty ledgers yield zeroes.
 * Data contract: sums `base_amount_minor` for asset and liability accounts; net = assets − liabilities.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param on - Inclusive cutoff date.
 * @returns Asset, liability and net totals.
 */
export async function reportNetWorth(tx: Transaction, familyId: string, on: string): Promise<ReportNetWorth> {
  const [row] = await tx
    .select({
      assetsBaseMinor:
        sql<number>`coalesce(sum(case when ${finAccounts.type} = 'asset' then ${finPostings.baseAmountMinor} else 0 end), 0)`.mapWith(
          Number,
        ),
      liabilitiesBaseMinor:
        sql<number>`coalesce(sum(case when ${finAccounts.type} = 'liability' then ${finPostings.baseAmountMinor} else 0 end), 0)`.mapWith(
          Number,
        ),
    })
    .from(finPostings)
    .innerJoin(
      finTransactions,
      and(
        eq(finTransactions.familyId, finPostings.familyId),
        eq(finTransactions.id, finPostings.transactionId),
      ),
    )
    .innerJoin(
      finAccounts,
      and(eq(finAccounts.familyId, finPostings.familyId), eq(finAccounts.id, finPostings.accountId)),
    )
    .where(
      and(
        eq(finPostings.familyId, familyId),
        isNull(finTransactions.deletedAt),
        isNull(finAccounts.deletedAt),
        inArray(finAccounts.type, ['asset', 'liability']),
        lte(finTransactions.bookedOn, on),
      ),
    );
  const assetsBaseMinor = row?.assetsBaseMinor ?? 0;
  const liabilitiesBaseMinor = row?.liabilitiesBaseMinor ?? 0;
  return {
    assetsBaseMinor,
    liabilitiesBaseMinor,
    netWorthBaseMinor: assetsBaseMinor - liabilitiesBaseMinor,
  };
}

/**
 * Reads the family's base currency code.
 *
 * Preconditions: the transaction has family context (or admin access).
 * Postconditions: missing or deleted families yield `null`.
 * Data contract: ISO 4217 three-letter code.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @returns The base currency, or `null`.
 */
export async function findFamilyBaseCurrency(tx: Transaction, familyId: string): Promise<string | null> {
  const [row] = await tx
    .select({ baseCurrency: families.baseCurrency })
    .from(families)
    .where(and(eq(families.id, familyId), isNull(families.deletedAt)));
  return row?.baseCurrency ?? null;
}

/**
 * Confirms a resident exists in the family.
 *
 * Preconditions: the transaction has family context.
 * Postconditions: soft-deleted residents are `null`.
 * Data contract: only the id is returned.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param residentId - Resident id.
 * @returns The id, or `null`.
 */
export async function findResident(
  tx: Transaction,
  familyId: string,
  residentId: string,
): Promise<{ id: string } | null> {
  const [row] = await tx
    .select({ id: residents.id })
    .from(residents)
    .where(and(eq(residents.familyId, familyId), eq(residents.id, residentId), isNull(residents.deletedAt)));
  return row ?? null;
}
