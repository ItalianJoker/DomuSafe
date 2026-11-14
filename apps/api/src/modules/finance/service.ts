import {
  currencySchema,
  encodeCursor,
  type CreateFinAccountRequest,
  type CreateFinBudgetRequest,
  type CreateFinRecurringRequest,
  type CreateFinSavingsGoalRequest,
  type CreateFinTransactionRequest,
  type FinAccount,
  type FinAccountLedger,
  type FinBudget,
  type FinPosting,
  type FinPostingInput,
  type FinRecurring,
  type FinRecurringTemplate,
  type FinReport,
  type FinReportKind,
  type FinSavingsGoal,
  type FinSplitShare,
  type FinTransaction,
  type FxRate,
  type PutFinSplitsRequest,
  type UpdateFinAccountRequest,
  type UpdateFinBudgetRequest,
  type UpdateFinRecurringRequest,
  type UpdateFinSavingsGoalRequest,
  type UpdateFinTransactionRequest,
} from '@domusafe/contracts';
import { recordAudit, recordRevision, withContext, type Database, type Transaction } from '@domusafe/db';
import { ProblemError, classifyDatabaseError } from '../../http/problem.js';
import type { TenantContext } from '../../types.js';
import * as repo from './repository.js';

/** One page of a list. */
export interface Page<T> {
  readonly items: T[];
  readonly nextCursor: string | null;
}

const account = (accountId: string): { kind: 'account'; accountId: string } => ({
  kind: 'account',
  accountId,
});

/**
 * Rounds toward ±∞ at halves (half away from zero).
 *
 * Preconditions: `n` is finite.
 * Postconditions: the result is an integer.
 * Data contract: used for `base_amount_minor` from floating FX products.
 *
 * @param n - Value to round.
 * @returns Rounded integer.
 */
export function roundHalfAwayFromZero(n: number): number {
  if (!Number.isFinite(n)) {
    throw new Error('FX amount is not finite');
  }
  return n >= 0 ? Math.round(n) : -Math.round(-n);
}

function rethrowDatabaseError(error: unknown): never {
  if (error instanceof ProblemError) {
    throw error;
  }
  const failure = classifyDatabaseError(error);
  switch (failure.kind) {
    case 'rls_denied':
      throw new ProblemError('forbidden');
    case 'unique':
      throw new ProblemError('duplicate');
    case 'foreign_key':
      throw new ProblemError('validation_failed', {
        detail: 'A referenced item does not exist in this family',
      });
    case 'check':
      throw new ProblemError('domain_rule_violated', {
        detail: `Constraint ${failure.constraint ?? 'check'} violated`,
      });
    case 'other':
      throw error;
  }
}

async function guarded<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    rethrowDatabaseError(error);
  }
}

function conflict(currentVersion: number): never {
  throw new ProblemError('version_conflict', { currentVersion });
}

function pageOfCreated<TRow extends { createdAt: Date; id: string }, TView>(
  rows: TRow[],
  limit: number,
  view: (row: TRow) => TView,
): Page<TView> {
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  const last = slice.at(-1);
  return {
    items: slice.map(view),
    nextCursor: hasMore && last !== undefined ? encodeCursor([last.createdAt.toISOString(), last.id]) : null,
  };
}

function pageOfKeyed<TRow, TView>(
  rows: TRow[],
  limit: number,
  view: (row: TRow) => TView,
  cursorOf: (row: TRow) => readonly [string, string],
): Page<TView> {
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  const last = slice.at(-1);
  return {
    items: slice.map(view),
    nextCursor: hasMore && last !== undefined ? encodeCursor(cursorOf(last)) : null,
  };
}

function fxRateString(rate: number): string {
  return rate.toFixed(10);
}

function numericOf(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('Stored FX rate is invalid');
  }
  return parsed;
}

function currencyOf(value: string): FinAccount['currency'] {
  const parsed = currencySchema.safeParse(value);
  if (!parsed.success) {
    throw new Error('Stored currency is not in the catalogue');
  }
  return parsed.data;
}

function accountView(row: repo.FinAccountRow): FinAccount {
  return {
    id: row.id,
    familyId: row.familyId,
    visibility: row.visibility,
    ownerAccountId: row.ownerAccountId,
    residentId: row.residentId,
    type: row.type,
    subtype: row.subtype,
    name: row.name,
    currency: currencyOf(row.currency),
    parentId: row.parentId,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function postingView(row: repo.FinPostingRow): FinPosting {
  return {
    id: row.id,
    accountId: row.accountId,
    amountMinor: row.amountMinor,
    currency: currencyOf(row.currency),
    fxRate: numericOf(row.fxRate),
    baseAmountMinor: row.baseAmountMinor,
    memo: row.memo,
  };
}

function splitView(row: repo.FinSplitShareRow): FinSplitShare {
  return {
    id: row.id,
    transactionId: row.transactionId,
    residentId: row.residentId,
    shareMinor: row.shareMinor,
    currency: currencyOf(row.currency),
    settledTransactionId: row.settledTransactionId,
  };
}

function transactionView(
  row: repo.FinTransactionRow,
  postings: readonly repo.FinPostingRow[],
  splits: readonly repo.FinSplitShareRow[],
): FinTransaction {
  return {
    id: row.id,
    familyId: row.familyId,
    bookedOn: row.bookedOn,
    description: row.description,
    payee: row.payee,
    status: row.status,
    recurringId: row.recurringId,
    tags: row.tags,
    notes: row.notes,
    postings: postings.map(postingView),
    splits: splits.map(splitView),
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function budgetView(row: repo.FinBudgetRow, spentMinor: number): FinBudget {
  return {
    id: row.id,
    familyId: row.familyId,
    accountId: row.accountId,
    period: row.period,
    startsOn: row.startsOn,
    amountMinor: row.amountMinor,
    currency: currencyOf(row.currency),
    rollover: row.rollover,
    spentMinor,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function savingsGoalView(row: repo.FinSavingsGoalRow, balanceMinor: number): FinSavingsGoal {
  return {
    id: row.id,
    familyId: row.familyId,
    residentId: row.residentId,
    accountId: row.accountId,
    name: row.name,
    targetMinor: row.targetMinor,
    targetDate: row.targetDate,
    balanceMinor,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function recurringTemplateOf(value: unknown): FinRecurringTemplate {
  if (value === null || typeof value !== 'object') {
    throw new Error('Stored recurring template is invalid');
  }
  const record = value as FinRecurringTemplate;
  return {
    description: record.description,
    payee: record.payee,
    tags: [...record.tags],
    notes: record.notes,
    postings: record.postings.map((posting) => ({
      accountId: posting.accountId,
      amountMinor: posting.amountMinor,
      currency: currencyOf(posting.currency),
      memo: posting.memo,
    })),
  };
}

function recurringView(row: repo.FinRecurringRow): FinRecurring {
  return {
    id: row.id,
    familyId: row.familyId,
    description: row.description,
    rrule: row.rrule,
    nextRunOn: row.nextRunOn,
    endOn: row.endOn,
    template: recurringTemplateOf(row.template),
    autoPost: row.autoPost,
    active: row.active,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function fxRateView(row: repo.FxRateRow): FxRate {
  return {
    base: currencyOf(row.base),
    quote: currencyOf(row.quote),
    rateDate: row.rateDate,
    rate: numericOf(row.rate),
    source: row.source,
  };
}

async function trace(
  tx: Transaction,
  tenant: TenantContext,
  input: {
    readonly resourceType: string;
    readonly resourceId: string;
    readonly op: 'create' | 'update' | 'delete';
    readonly version: number;
    readonly action: string;
    readonly data: Record<string, unknown>;
  },
): Promise<void> {
  const actor = { kind: 'account' as const, id: tenant.accountId };
  await recordRevision(tx, {
    familyId: tenant.familyId,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    version: input.version,
    op: input.op,
    actor,
    data: input.data,
  });
  await recordAudit(tx, {
    familyId: tenant.familyId,
    actor,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    outcome: 'success',
    metadata: { version: input.version },
  });
}

function validateAccountRules(input: {
  readonly type: FinAccount['type'];
  readonly subtype: FinAccount['subtype'];
  readonly residentId: string | null;
}): void {
  if (input.subtype === 'piggy_bank' && input.residentId === null) {
    throw new ProblemError('domain_rule_violated', {
      detail: 'A piggy bank account requires a resident',
    });
  }
  if (input.subtype === 'category' && input.type !== 'income' && input.type !== 'expense') {
    throw new ProblemError('domain_rule_violated', {
      detail: 'Category accounts must be income or expense',
    });
  }
}

/**
 * Validates that posting lines balance per currency and have at least two lines.
 *
 * Preconditions: amounts are signed non-zero minor units.
 * Postconditions: throws `domain_rule_violated` when unbalanced or too few lines.
 * Data contract: sums are exact integers per ISO currency code.
 *
 * @param postings - Posting inputs.
 */
function validatePostingsBalance(postings: readonly { readonly currency: string; readonly amountMinor: number }[]): void {
  if (postings.length < 2) {
    throw new ProblemError('domain_rule_violated', {
      detail: 'A transaction needs at least two posting lines',
    });
  }
  const sums = new Map<string, number>();
  for (const posting of postings) {
    sums.set(posting.currency, (sums.get(posting.currency) ?? 0) + posting.amountMinor);
  }
  for (const [currency, sum] of sums) {
    if (sum !== 0) {
      throw new ProblemError('domain_rule_violated', {
        detail: `Postings in ${currency} do not sum to zero`,
      });
    }
  }
}

/**
 * Advances a calendar date by the FREQ step of a simple RRULE.
 *
 * Preconditions: `rrule` starts with `FREQ=DAILY|WEEKLY|MONTHLY|YEARLY`; `on` is `YYYY-MM-DD`.
 * Postconditions: returns the next run date in UTC calendar arithmetic.
 * Data contract: only the FREQ token is interpreted.
 *
 * @param on - Current run date.
 * @param rrule - Recurrence rule.
 * @returns Next run date.
 */
function advanceByRrule(on: string, rrule: string): string {
  const match = /^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)/u.exec(rrule);
  if (match === null) {
    throw new ProblemError('validation_failed', { detail: 'Unsupported recurrence rule' });
  }
  const date = new Date(`${on}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new ProblemError('validation_failed', { detail: 'Invalid run date' });
  }
  switch (match[1]) {
    case 'DAILY':
      date.setUTCDate(date.getUTCDate() + 1);
      break;
    case 'WEEKLY':
      date.setUTCDate(date.getUTCDate() + 7);
      break;
    case 'MONTHLY':
      date.setUTCMonth(date.getUTCMonth() + 1);
      break;
    case 'YEARLY':
      date.setUTCFullYear(date.getUTCFullYear() + 1);
      break;
    default:
      throw new ProblemError('validation_failed', { detail: 'Unsupported recurrence rule' });
  }
  return date.toISOString().slice(0, 10);
}

/**
 * Resolves the FX multiplier from posting currency to family base and the base amount.
 *
 * Preconditions: `bookedOn` is a calendar date; rates in `fx_rates` are EUR→quote when looked up.
 * Postconditions: `fxRate` converts posting minor units to base minor units (same decimals assumed).
 * Data contract: ECB-style rates are inverted when converting quote→EUR.
 *
 * @param tx - Transaction.
 * @param amountMinor - Signed amount in posting currency.
 * @param currency - Posting currency.
 * @param baseCurrency - Family base currency.
 * @param bookedOn - Booking date for rate lookup.
 * @param providedFxRate - Optional client-supplied multiplier.
 * @returns Multiplier and base amount.
 */
async function resolveFx(
  tx: Transaction,
  amountMinor: number,
  currency: string,
  baseCurrency: string,
  bookedOn: string,
  providedFxRate: number | undefined,
): Promise<{ readonly fxRate: number; readonly baseAmountMinor: number }> {
  if (currency === baseCurrency) {
    return { fxRate: 1, baseAmountMinor: amountMinor };
  }
  if (providedFxRate !== undefined) {
    return {
      fxRate: providedFxRate,
      baseAmountMinor: roundHalfAwayFromZero(amountMinor * providedFxRate),
    };
  }

  let fxRate: number;
  if (baseCurrency === 'EUR') {
    if (currency === 'EUR') {
      fxRate = 1;
    } else {
      const row = await repo.findFxRate(tx, 'EUR', currency, bookedOn);
      if (row === null) {
        throw new ProblemError('validation_failed', {
          detail: `No FX rate for EUR/${currency} on or before ${bookedOn}`,
        });
      }
      fxRate = 1 / numericOf(row.rate);
    }
  } else if (currency === 'EUR') {
    const row = await repo.findFxRate(tx, 'EUR', baseCurrency, bookedOn);
    if (row === null) {
      throw new ProblemError('validation_failed', {
        detail: `No FX rate for EUR/${baseCurrency} on or before ${bookedOn}`,
      });
    }
    fxRate = numericOf(row.rate);
  } else {
    const quoteRow = await repo.findFxRate(tx, 'EUR', currency, bookedOn);
    const baseRow = await repo.findFxRate(tx, 'EUR', baseCurrency, bookedOn);
    if (quoteRow === null || baseRow === null) {
      throw new ProblemError('validation_failed', {
        detail: `No cross FX rate for ${currency}→${baseCurrency} on or before ${bookedOn}`,
      });
    }
    fxRate = numericOf(baseRow.rate) / numericOf(quoteRow.rate);
  }

  return {
    fxRate,
    baseAmountMinor: roundHalfAwayFromZero(amountMinor * fxRate),
  };
}

async function requireResident(tx: Transaction, familyId: string, residentId: string): Promise<void> {
  const row = await repo.findResident(tx, familyId, residentId);
  if (row === null) {
    throw new ProblemError('not_found');
  }
}

async function loadTransactionView(
  tx: Transaction,
  familyId: string,
  header: repo.FinTransactionRow,
): Promise<FinTransaction> {
  const postings = await repo.listPostingsForTransactions(tx, familyId, [header.id]);
  const splits = await repo.listSplitsForTransactions(tx, familyId, [header.id]);
  return transactionView(header, postings.get(header.id) ?? [], splits.get(header.id) ?? []);
}

async function loadTransactionViews(
  tx: Transaction,
  familyId: string,
  headers: readonly repo.FinTransactionRow[],
): Promise<FinTransaction[]> {
  const ids = headers.map((row) => row.id);
  const postings = await repo.listPostingsForTransactions(tx, familyId, ids);
  const splits = await repo.listSplitsForTransactions(tx, familyId, ids);
  return headers.map((header) =>
    transactionView(header, postings.get(header.id) ?? [], splits.get(header.id) ?? []),
  );
}

async function buildPostingRows(
  tx: Transaction,
  familyId: string,
  transactionId: string,
  bookedOn: string,
  baseCurrency: string,
  postings: readonly FinPostingInput[],
): Promise<
  readonly {
    readonly familyId: string;
    readonly transactionId: string;
    readonly accountId: string;
    readonly amountMinor: number;
    readonly currency: string;
    readonly fxRate: string;
    readonly baseAmountMinor: number;
    readonly memo: string | null;
  }[]
> {
  validatePostingsBalance(postings);
  const rows = [];
  for (const posting of postings) {
    const ledgerAccount = await repo.findAccount(tx, familyId, posting.accountId);
    if (ledgerAccount === null) {
      throw new ProblemError('not_found');
    }
    if (ledgerAccount.currency !== posting.currency) {
      throw new ProblemError('domain_rule_violated', {
        detail: 'Posting currency must match the account currency',
      });
    }
    const fx = await resolveFx(
      tx,
      posting.amountMinor,
      posting.currency,
      baseCurrency,
      bookedOn,
      posting.fxRate,
    );
    rows.push({
      familyId,
      transactionId,
      accountId: posting.accountId,
      amountMinor: posting.amountMinor,
      currency: posting.currency,
      fxRate: fxRateString(fx.fxRate),
      baseAmountMinor: fx.baseAmountMinor,
      memo: posting.memo ?? null,
    });
  }
  return rows;
}

async function insertBalancedTransaction(
  tx: Transaction,
  tenant: TenantContext,
  input: {
    readonly bookedOn: string;
    readonly description: string;
    readonly payee: string | null;
    readonly status: FinTransaction['status'];
    readonly recurringId: string | null;
    readonly tags: readonly string[];
    readonly notes: string | null;
    readonly postings: readonly FinPostingInput[];
  },
): Promise<FinTransaction> {
  const baseCurrency = await repo.findFamilyBaseCurrency(tx, tenant.familyId);
  if (baseCurrency === null) {
    throw new ProblemError('not_found');
  }
  const header = await repo.insertTransaction(tx, {
    familyId: tenant.familyId,
    bookedOn: input.bookedOn,
    description: input.description,
    payee: input.payee,
    status: input.status,
    recurringId: input.recurringId,
    tags: input.tags,
    notes: input.notes,
    createdBy: tenant.accountId,
  });
  await repo.insertPostings(
    tx,
    await buildPostingRows(tx, tenant.familyId, header.id, input.bookedOn, baseCurrency, input.postings),
  );
  await trace(tx, tenant, {
    resourceType: 'fin_transactions',
    resourceId: header.id,
    op: 'create',
    version: header.version,
    action: 'finance.transactions.create',
    data: { id: header.id },
  });
  return loadTransactionView(tx, tenant.familyId, header);
}

async function budgetWithSpent(tx: Transaction, familyId: string, row: repo.FinBudgetRow): Promise<FinBudget> {
  const spentMinor = await repo.sumSpentForBudget(tx, familyId, row.accountId, row.startsOn, row.period);
  return budgetView(row, spentMinor);
}

async function savingsWithBalance(
  tx: Transaction,
  familyId: string,
  row: repo.FinSavingsGoalRow,
): Promise<FinSavingsGoal> {
  const balance = await repo.sumAccountBalance(tx, familyId, row.accountId);
  return savingsGoalView(row, balance.balanceMinor);
}

/**
 * Family finance use-cases: double-entry accounts, transactions, budgets, savings, recurring and reports.
 * Plan feature `finance` is enforced on the routes.
 *
 * @param db - Database pool wrapper.
 * @returns The service surface used by routes.
 */
export function createFinanceService(db: Database) {
  const inFamily = <T>(tenant: TenantContext, work: (tx: Transaction) => Promise<T>): Promise<T> =>
    guarded(() => withContext(db, { principal: account(tenant.accountId), familyId: tenant.familyId }, work));

  const inAccount = <T>(accountId: string, work: (tx: Transaction) => Promise<T>): Promise<T> =>
    guarded(() => withContext(db, { principal: account(accountId) }, work));

  return {
    listAccounts(
      tenant: TenantContext,
      query: {
        readonly limit: number;
        readonly after: readonly [string, string] | null;
        readonly type?: FinAccount['type'] | undefined;
        readonly subtype?: FinAccount['subtype'] | undefined;
        readonly includeArchived?: boolean | undefined;
      },
    ): Promise<Page<FinAccount>> {
      return inFamily(tenant, async (tx) =>
        pageOfCreated(
          await repo.listAccounts(tx, { familyId: tenant.familyId, ...query }),
          query.limit,
          accountView,
        ),
      );
    },

    createAccount(tenant: TenantContext, body: CreateFinAccountRequest): Promise<FinAccount> {
      return inFamily(tenant, async (tx) => {
        const visibility = body.visibility ?? 'family';
        const residentId = body.residentId ?? null;
        const ownerAccountId =
          visibility === 'personal' ? (body.ownerAccountId ?? tenant.accountId) : (body.ownerAccountId ?? null);
        if (visibility === 'personal' && ownerAccountId === null) {
          throw new ProblemError('domain_rule_violated', {
            detail: 'A personal account requires an owner',
          });
        }
        if (visibility === 'family' && ownerAccountId !== null) {
          throw new ProblemError('domain_rule_violated', {
            detail: 'A family account cannot have an owner',
          });
        }
        validateAccountRules({ type: body.type, subtype: body.subtype, residentId });
        if (residentId !== null) {
          await requireResident(tx, tenant.familyId, residentId);
        }
        if (body.parentId !== undefined && body.parentId !== null) {
          const parent = await repo.findAccount(tx, tenant.familyId, body.parentId);
          if (parent === null) {
            throw new ProblemError('not_found');
          }
        }
        const row = await repo.insertAccount(tx, {
          familyId: tenant.familyId,
          visibility,
          ownerAccountId,
          residentId,
          type: body.type,
          subtype: body.subtype,
          name: body.name,
          currency: body.currency,
          parentId: body.parentId ?? null,
          createdBy: tenant.accountId,
        });
        await trace(tx, tenant, {
          resourceType: 'fin_accounts',
          resourceId: row.id,
          op: 'create',
          version: row.version,
          action: 'finance.accounts.create',
          data: { id: row.id },
        });
        return accountView(row);
      });
    },

    updateAccount(
      tenant: TenantContext,
      accountId: string,
      expectedVersion: number,
      body: UpdateFinAccountRequest,
    ): Promise<FinAccount> {
      return inFamily(tenant, async (tx) => {
        const current = await repo.findAccount(tx, tenant.familyId, accountId);
        if (current === null) {
          throw new ProblemError('not_found');
        }
        const nextResidentId = body.residentId === undefined ? current.residentId : body.residentId;
        validateAccountRules({
          type: current.type,
          subtype: current.subtype,
          residentId: nextResidentId,
        });
        if (body.residentId !== undefined && body.residentId !== null) {
          await requireResident(tx, tenant.familyId, body.residentId);
        }
        if (body.parentId !== undefined && body.parentId !== null) {
          const parent = await repo.findAccount(tx, tenant.familyId, body.parentId);
          if (parent === null) {
            throw new ProblemError('not_found');
          }
        }
        const row = await repo.updateAccount(tx, tenant.familyId, accountId, expectedVersion, {
          ...(body.name === undefined ? {} : { name: body.name }),
          ...(body.parentId === undefined ? {} : { parentId: body.parentId }),
          ...(body.residentId === undefined ? {} : { residentId: body.residentId }),
          ...(body.archivedAt === undefined
            ? {}
            : { archivedAt: body.archivedAt === null ? null : new Date(body.archivedAt) }),
          updatedBy: tenant.accountId,
        });
        if (row === null) {
          conflict(current.version);
        }
        await trace(tx, tenant, {
          resourceType: 'fin_accounts',
          resourceId: row.id,
          op: 'update',
          version: row.version,
          action: 'finance.accounts.update',
          data: { id: row.id },
        });
        return accountView(row);
      });
    },

    deleteAccount(tenant: TenantContext, accountId: string, expectedVersion: number): Promise<void> {
      return inFamily(tenant, async (tx) => {
        const current = await repo.findAccount(tx, tenant.familyId, accountId);
        if (current === null) {
          throw new ProblemError('not_found');
        }
        const row = await repo.softDeleteAccount(
          tx,
          tenant.familyId,
          accountId,
          expectedVersion,
          tenant.accountId,
        );
        if (row === null) {
          conflict(current.version);
        }
        await trace(tx, tenant, {
          resourceType: 'fin_accounts',
          resourceId: row.id,
          op: 'delete',
          version: row.version,
          action: 'finance.accounts.delete',
          data: { id: row.id },
        });
      });
    },

    getAccountLedger(
      tenant: TenantContext,
      accountId: string,
      query: {
        readonly limit: number;
        readonly after: readonly [string, string] | null;
        readonly from?: string | undefined;
        readonly to?: string | undefined;
      },
    ): Promise<FinAccountLedger> {
      return inFamily(tenant, async (tx) => {
        const ledgerAccount = await repo.findAccount(tx, tenant.familyId, accountId);
        if (ledgerAccount === null) {
          throw new ProblemError('not_found');
        }
        const balance = await repo.sumAccountBalance(tx, tenant.familyId, accountId);
        const headers = await repo.listTransactions(tx, {
          familyId: tenant.familyId,
          accountId,
          from: query.from,
          to: query.to,
          limit: query.limit,
          after: query.after,
        });
        const page = pageOfKeyed(
          headers,
          query.limit,
          (row) => row,
          (row) => [row.bookedOn, row.id] as const,
        );
        const items = await loadTransactionViews(tx, tenant.familyId, page.items);
        return {
          account: accountView(ledgerAccount),
          balanceMinor: balance.balanceMinor,
          baseBalanceMinor: balance.baseBalanceMinor,
          items,
          nextCursor: page.nextCursor,
        };
      });
    },

    listTransactions(
      tenant: TenantContext,
      query: {
        readonly limit: number;
        readonly after: readonly [string, string] | null;
        readonly from?: string | undefined;
        readonly to?: string | undefined;
        readonly accountId?: string | undefined;
      },
    ): Promise<Page<FinTransaction>> {
      return inFamily(tenant, async (tx) => {
        const headers = await repo.listTransactions(tx, { familyId: tenant.familyId, ...query });
        const page = pageOfKeyed(
          headers,
          query.limit,
          (row) => row,
          (row) => [row.bookedOn, row.id] as const,
        );
        return {
          items: await loadTransactionViews(tx, tenant.familyId, page.items),
          nextCursor: page.nextCursor,
        };
      });
    },

    getTransaction(tenant: TenantContext, transactionId: string): Promise<FinTransaction> {
      return inFamily(tenant, async (tx) => {
        const header = await repo.findTransaction(tx, tenant.familyId, transactionId);
        if (header === null) {
          throw new ProblemError('not_found');
        }
        return loadTransactionView(tx, tenant.familyId, header);
      });
    },

    createTransaction(tenant: TenantContext, body: CreateFinTransactionRequest): Promise<FinTransaction> {
      return inFamily(tenant, async (tx) =>
        insertBalancedTransaction(tx, tenant, {
          bookedOn: body.bookedOn,
          description: body.description,
          payee: body.payee ?? null,
          status: body.status ?? 'cleared',
          recurringId: null,
          tags: body.tags ?? [],
          notes: body.notes ?? null,
          postings: body.postings,
        }),
      );
    },

    updateTransaction(
      tenant: TenantContext,
      transactionId: string,
      expectedVersion: number,
      body: UpdateFinTransactionRequest,
    ): Promise<FinTransaction> {
      return inFamily(tenant, async (tx) => {
        const current = await repo.findTransaction(tx, tenant.familyId, transactionId);
        if (current === null) {
          throw new ProblemError('not_found');
        }
        const header = await repo.updateTransaction(tx, tenant.familyId, transactionId, expectedVersion, {
          ...(body.bookedOn === undefined ? {} : { bookedOn: body.bookedOn }),
          ...(body.description === undefined ? {} : { description: body.description }),
          ...(body.payee === undefined ? {} : { payee: body.payee }),
          ...(body.status === undefined ? {} : { status: body.status }),
          ...(body.tags === undefined ? {} : { tags: body.tags }),
          ...(body.notes === undefined ? {} : { notes: body.notes }),
          updatedBy: tenant.accountId,
        });
        if (header === null) {
          conflict(current.version);
        }
        if (body.postings !== undefined) {
          const baseCurrency = await repo.findFamilyBaseCurrency(tx, tenant.familyId);
          if (baseCurrency === null) {
            throw new ProblemError('not_found');
          }
          const bookedOn = body.bookedOn ?? header.bookedOn;
          await repo.deletePostingsForTransaction(tx, tenant.familyId, transactionId);
          await repo.insertPostings(
            tx,
            await buildPostingRows(
              tx,
              tenant.familyId,
              transactionId,
              bookedOn,
              baseCurrency,
              body.postings,
            ),
          );
        }
        await trace(tx, tenant, {
          resourceType: 'fin_transactions',
          resourceId: header.id,
          op: 'update',
          version: header.version,
          action: 'finance.transactions.update',
          data: { id: header.id },
        });
        return loadTransactionView(tx, tenant.familyId, header);
      });
    },

    deleteTransaction(tenant: TenantContext, transactionId: string, expectedVersion: number): Promise<void> {
      return inFamily(tenant, async (tx) => {
        const current = await repo.findTransaction(tx, tenant.familyId, transactionId);
        if (current === null) {
          throw new ProblemError('not_found');
        }
        const row = await repo.softDeleteTransaction(
          tx,
          tenant.familyId,
          transactionId,
          expectedVersion,
          tenant.accountId,
        );
        if (row === null) {
          conflict(current.version);
        }
        await trace(tx, tenant, {
          resourceType: 'fin_transactions',
          resourceId: row.id,
          op: 'delete',
          version: row.version,
          action: 'finance.transactions.delete',
          data: { id: row.id },
        });
      });
    },

    putSplits(
      tenant: TenantContext,
      transactionId: string,
      body: PutFinSplitsRequest,
    ): Promise<FinTransaction> {
      return inFamily(tenant, async (tx) => {
        const current = await repo.findTransaction(tx, tenant.familyId, transactionId);
        if (current === null) {
          throw new ProblemError('not_found');
        }
        for (const share of body.shares) {
          await requireResident(tx, tenant.familyId, share.residentId);
          if (share.settledTransactionId !== undefined && share.settledTransactionId !== null) {
            const settled = await repo.findTransaction(tx, tenant.familyId, share.settledTransactionId);
            if (settled === null) {
              throw new ProblemError('not_found');
            }
          }
        }
        await repo.deleteSplitsForTransaction(tx, tenant.familyId, transactionId);
        await repo.insertSplits(
          tx,
          body.shares.map((share) => ({
            familyId: tenant.familyId,
            transactionId,
            residentId: share.residentId,
            shareMinor: share.shareMinor,
            currency: share.currency,
            settledTransactionId: share.settledTransactionId ?? null,
          })),
        );
        const header = await repo.updateTransaction(tx, tenant.familyId, transactionId, current.version, {
          updatedBy: tenant.accountId,
        });
        if (header === null) {
          conflict(current.version);
        }
        await trace(tx, tenant, {
          resourceType: 'fin_transactions',
          resourceId: header.id,
          op: 'update',
          version: header.version,
          action: 'finance.transactions.splits',
          data: { id: header.id },
        });
        return loadTransactionView(tx, tenant.familyId, header);
      });
    },

    listBudgets(
      tenant: TenantContext,
      query: { readonly limit: number; readonly after: readonly [string, string] | null },
    ): Promise<Page<FinBudget>> {
      return inFamily(tenant, async (tx) => {
        const rows = await repo.listBudgets(tx, { familyId: tenant.familyId, ...query });
        const page = pageOfCreated(rows, query.limit, (row) => row);
        const items = await Promise.all(
          page.items.map((row) => budgetWithSpent(tx, tenant.familyId, row)),
        );
        return { items, nextCursor: page.nextCursor };
      });
    },

    createBudget(tenant: TenantContext, body: CreateFinBudgetRequest): Promise<FinBudget> {
      return inFamily(tenant, async (tx) => {
        const ledgerAccount = await repo.findAccount(tx, tenant.familyId, body.accountId);
        if (ledgerAccount === null) {
          throw new ProblemError('not_found');
        }
        const row = await repo.insertBudget(tx, {
          familyId: tenant.familyId,
          accountId: body.accountId,
          period: body.period,
          startsOn: body.startsOn,
          amountMinor: body.amountMinor,
          currency: body.currency,
          rollover: body.rollover ?? false,
          createdBy: tenant.accountId,
        });
        await trace(tx, tenant, {
          resourceType: 'fin_budgets',
          resourceId: row.id,
          op: 'create',
          version: row.version,
          action: 'finance.budgets.create',
          data: { id: row.id },
        });
        return budgetWithSpent(tx, tenant.familyId, row);
      });
    },

    updateBudget(
      tenant: TenantContext,
      budgetId: string,
      expectedVersion: number,
      body: UpdateFinBudgetRequest,
    ): Promise<FinBudget> {
      return inFamily(tenant, async (tx) => {
        const current = await repo.findBudget(tx, tenant.familyId, budgetId);
        if (current === null) {
          throw new ProblemError('not_found');
        }
        const row = await repo.updateBudget(tx, tenant.familyId, budgetId, expectedVersion, {
          ...(body.amountMinor === undefined ? {} : { amountMinor: body.amountMinor }),
          ...(body.rollover === undefined ? {} : { rollover: body.rollover }),
          ...(body.startsOn === undefined ? {} : { startsOn: body.startsOn }),
          updatedBy: tenant.accountId,
        });
        if (row === null) {
          conflict(current.version);
        }
        await trace(tx, tenant, {
          resourceType: 'fin_budgets',
          resourceId: row.id,
          op: 'update',
          version: row.version,
          action: 'finance.budgets.update',
          data: { id: row.id },
        });
        return budgetWithSpent(tx, tenant.familyId, row);
      });
    },

    deleteBudget(tenant: TenantContext, budgetId: string, expectedVersion: number): Promise<void> {
      return inFamily(tenant, async (tx) => {
        const current = await repo.findBudget(tx, tenant.familyId, budgetId);
        if (current === null) {
          throw new ProblemError('not_found');
        }
        const row = await repo.softDeleteBudget(
          tx,
          tenant.familyId,
          budgetId,
          expectedVersion,
          tenant.accountId,
        );
        if (row === null) {
          conflict(current.version);
        }
        await trace(tx, tenant, {
          resourceType: 'fin_budgets',
          resourceId: row.id,
          op: 'delete',
          version: row.version,
          action: 'finance.budgets.delete',
          data: { id: row.id },
        });
      });
    },

    listSavingsGoals(
      tenant: TenantContext,
      query: { readonly limit: number; readonly after: readonly [string, string] | null },
    ): Promise<Page<FinSavingsGoal>> {
      return inFamily(tenant, async (tx) => {
        const rows = await repo.listSavingsGoals(tx, { familyId: tenant.familyId, ...query });
        const page = pageOfCreated(rows, query.limit, (row) => row);
        const items = await Promise.all(
          page.items.map((row) => savingsWithBalance(tx, tenant.familyId, row)),
        );
        return { items, nextCursor: page.nextCursor };
      });
    },

    createSavingsGoal(tenant: TenantContext, body: CreateFinSavingsGoalRequest): Promise<FinSavingsGoal> {
      return inFamily(tenant, async (tx) => {
        const ledgerAccount = await repo.findAccount(tx, tenant.familyId, body.accountId);
        if (ledgerAccount === null) {
          throw new ProblemError('not_found');
        }
        if (ledgerAccount.subtype !== 'savings' && ledgerAccount.subtype !== 'piggy_bank') {
          throw new ProblemError('domain_rule_violated', {
            detail: 'Savings goals require a savings or piggy bank account',
          });
        }
        const residentId = body.residentId ?? null;
        if (residentId !== null) {
          await requireResident(tx, tenant.familyId, residentId);
        }
        const row = await repo.insertSavingsGoal(tx, {
          familyId: tenant.familyId,
          residentId,
          accountId: body.accountId,
          name: body.name,
          targetMinor: body.targetMinor,
          targetDate: body.targetDate ?? null,
          createdBy: tenant.accountId,
        });
        await trace(tx, tenant, {
          resourceType: 'fin_savings_goals',
          resourceId: row.id,
          op: 'create',
          version: row.version,
          action: 'finance.savings_goals.create',
          data: { id: row.id },
        });
        return savingsWithBalance(tx, tenant.familyId, row);
      });
    },

    updateSavingsGoal(
      tenant: TenantContext,
      goalId: string,
      expectedVersion: number,
      body: UpdateFinSavingsGoalRequest,
    ): Promise<FinSavingsGoal> {
      return inFamily(tenant, async (tx) => {
        const current = await repo.findSavingsGoal(tx, tenant.familyId, goalId);
        if (current === null) {
          throw new ProblemError('not_found');
        }
        if (body.residentId !== undefined && body.residentId !== null) {
          await requireResident(tx, tenant.familyId, body.residentId);
        }
        const row = await repo.updateSavingsGoal(tx, tenant.familyId, goalId, expectedVersion, {
          ...(body.name === undefined ? {} : { name: body.name }),
          ...(body.targetMinor === undefined ? {} : { targetMinor: body.targetMinor }),
          ...(body.targetDate === undefined ? {} : { targetDate: body.targetDate }),
          ...(body.residentId === undefined ? {} : { residentId: body.residentId }),
          updatedBy: tenant.accountId,
        });
        if (row === null) {
          conflict(current.version);
        }
        await trace(tx, tenant, {
          resourceType: 'fin_savings_goals',
          resourceId: row.id,
          op: 'update',
          version: row.version,
          action: 'finance.savings_goals.update',
          data: { id: row.id },
        });
        return savingsWithBalance(tx, tenant.familyId, row);
      });
    },

    deleteSavingsGoal(tenant: TenantContext, goalId: string, expectedVersion: number): Promise<void> {
      return inFamily(tenant, async (tx) => {
        const current = await repo.findSavingsGoal(tx, tenant.familyId, goalId);
        if (current === null) {
          throw new ProblemError('not_found');
        }
        const row = await repo.softDeleteSavingsGoal(
          tx,
          tenant.familyId,
          goalId,
          expectedVersion,
          tenant.accountId,
        );
        if (row === null) {
          conflict(current.version);
        }
        await trace(tx, tenant, {
          resourceType: 'fin_savings_goals',
          resourceId: row.id,
          op: 'delete',
          version: row.version,
          action: 'finance.savings_goals.delete',
          data: { id: row.id },
        });
      });
    },

    listRecurring(
      tenant: TenantContext,
      query: { readonly limit: number; readonly after: readonly [string, string] | null },
    ): Promise<Page<FinRecurring>> {
      return inFamily(tenant, async (tx) =>
        pageOfCreated(
          await repo.listRecurring(tx, { familyId: tenant.familyId, ...query }),
          query.limit,
          recurringView,
        ),
      );
    },

    createRecurring(tenant: TenantContext, body: CreateFinRecurringRequest): Promise<FinRecurring> {
      return inFamily(tenant, async (tx) => {
        validatePostingsBalance(body.template.postings);
        for (const posting of body.template.postings) {
          const ledgerAccount = await repo.findAccount(tx, tenant.familyId, posting.accountId);
          if (ledgerAccount === null) {
            throw new ProblemError('not_found');
          }
          if (ledgerAccount.currency !== posting.currency) {
            throw new ProblemError('domain_rule_violated', {
              detail: 'Template posting currency must match the account currency',
            });
          }
        }
        const row = await repo.insertRecurring(tx, {
          familyId: tenant.familyId,
          description: body.description,
          rrule: body.rrule,
          nextRunOn: body.nextRunOn,
          endOn: body.endOn ?? null,
          template: body.template,
          autoPost: body.autoPost ?? false,
          active: body.active ?? true,
          createdBy: tenant.accountId,
        });
        await trace(tx, tenant, {
          resourceType: 'fin_recurring',
          resourceId: row.id,
          op: 'create',
          version: row.version,
          action: 'finance.recurring.create',
          data: { id: row.id },
        });
        return recurringView(row);
      });
    },

    updateRecurring(
      tenant: TenantContext,
      recurringId: string,
      expectedVersion: number,
      body: UpdateFinRecurringRequest,
    ): Promise<FinRecurring> {
      return inFamily(tenant, async (tx) => {
        const current = await repo.findRecurring(tx, tenant.familyId, recurringId);
        if (current === null) {
          throw new ProblemError('not_found');
        }
        if (body.template !== undefined) {
          validatePostingsBalance(body.template.postings);
          for (const posting of body.template.postings) {
            const ledgerAccount = await repo.findAccount(tx, tenant.familyId, posting.accountId);
            if (ledgerAccount === null) {
              throw new ProblemError('not_found');
            }
            if (ledgerAccount.currency !== posting.currency) {
              throw new ProblemError('domain_rule_violated', {
                detail: 'Template posting currency must match the account currency',
              });
            }
          }
        }
        const row = await repo.updateRecurring(tx, tenant.familyId, recurringId, expectedVersion, {
          ...(body.description === undefined ? {} : { description: body.description }),
          ...(body.rrule === undefined ? {} : { rrule: body.rrule }),
          ...(body.nextRunOn === undefined ? {} : { nextRunOn: body.nextRunOn }),
          ...(body.endOn === undefined ? {} : { endOn: body.endOn }),
          ...(body.template === undefined ? {} : { template: body.template }),
          ...(body.autoPost === undefined ? {} : { autoPost: body.autoPost }),
          ...(body.active === undefined ? {} : { active: body.active }),
          updatedBy: tenant.accountId,
        });
        if (row === null) {
          conflict(current.version);
        }
        await trace(tx, tenant, {
          resourceType: 'fin_recurring',
          resourceId: row.id,
          op: 'update',
          version: row.version,
          action: 'finance.recurring.update',
          data: { id: row.id },
        });
        return recurringView(row);
      });
    },

    deleteRecurring(tenant: TenantContext, recurringId: string, expectedVersion: number): Promise<void> {
      return inFamily(tenant, async (tx) => {
        const current = await repo.findRecurring(tx, tenant.familyId, recurringId);
        if (current === null) {
          throw new ProblemError('not_found');
        }
        const row = await repo.softDeleteRecurring(
          tx,
          tenant.familyId,
          recurringId,
          expectedVersion,
          tenant.accountId,
        );
        if (row === null) {
          conflict(current.version);
        }
        await trace(tx, tenant, {
          resourceType: 'fin_recurring',
          resourceId: row.id,
          op: 'delete',
          version: row.version,
          action: 'finance.recurring.delete',
          data: { id: row.id },
        });
      });
    },

    runRecurring(tenant: TenantContext, recurringId: string): Promise<FinTransaction> {
      return inFamily(tenant, async (tx) => {
        const current = await repo.findRecurring(tx, tenant.familyId, recurringId);
        if (current === null) {
          throw new ProblemError('not_found');
        }
        if (!current.active) {
          throw new ProblemError('domain_rule_violated', {
            detail: 'Recurring entry is inactive',
          });
        }
        if (current.endOn !== null && current.nextRunOn > current.endOn) {
          throw new ProblemError('domain_rule_violated', {
            detail: 'Recurring entry is past its end date',
          });
        }
        const template = recurringTemplateOf(current.template);
        const created = await insertBalancedTransaction(tx, tenant, {
          bookedOn: current.nextRunOn,
          description: template.description,
          payee: template.payee,
          status: 'cleared',
          recurringId: current.id,
          tags: template.tags,
          notes: template.notes,
          postings: template.postings.map((posting) => ({
            accountId: posting.accountId,
            amountMinor: posting.amountMinor,
            currency: posting.currency,
            memo: posting.memo,
          })),
        });
        const nextRunOn = advanceByRrule(current.nextRunOn, current.rrule);
        const pastEnd = current.endOn !== null && nextRunOn > current.endOn;
        const updated = await repo.updateRecurring(tx, tenant.familyId, recurringId, current.version, {
          nextRunOn,
          ...(pastEnd ? { active: false } : {}),
          updatedBy: tenant.accountId,
        });
        if (updated === null) {
          conflict(current.version);
        }
        await trace(tx, tenant, {
          resourceType: 'fin_recurring',
          resourceId: updated.id,
          op: 'update',
          version: updated.version,
          action: 'finance.recurring.run',
          data: { id: updated.id, transactionId: created.id },
        });
        return created;
      });
    },

    getReport(
      tenant: TenantContext,
      kind: FinReportKind,
      from: string,
      to: string,
    ): Promise<FinReport> {
      return inFamily(tenant, async (tx) => {
        const baseCurrency = await repo.findFamilyBaseCurrency(tx, tenant.familyId);
        if (baseCurrency === null) {
          throw new ProblemError('not_found');
        }
        const currency = currencyOf(baseCurrency);
        switch (kind) {
          case 'balances': {
            const rows = await repo.reportBalances(tx, tenant.familyId, from, to);
            return {
              kind,
              from,
              to,
              currency,
              rows: rows.map((row) => ({
                key: row.accountId,
                label: row.accountName,
                amountMinor: row.baseAmountMinor,
                currency,
              })),
            };
          }
          case 'income-expense': {
            const rows = await repo.reportIncomeExpense(tx, tenant.familyId, from, to);
            return {
              kind,
              from,
              to,
              currency,
              rows: rows.map((row) => ({
                key: row.type,
                label: row.type === 'income' ? 'Income' : 'Expense',
                amountMinor: row.baseAmountMinor,
                currency,
              })),
            };
          }
          case 'by-category': {
            const rows = await repo.reportByCategory(tx, tenant.familyId, from, to);
            return {
              kind,
              from,
              to,
              currency,
              rows: rows.map((row) => ({
                key: row.accountId,
                label: row.accountName,
                amountMinor: row.baseAmountMinor,
                currency,
              })),
            };
          }
          case 'net-worth': {
            const snapshot = await repo.reportNetWorth(tx, tenant.familyId, to);
            return {
              kind,
              from,
              to,
              currency,
              rows: [
                {
                  key: 'assets',
                  label: 'Assets',
                  amountMinor: snapshot.assetsBaseMinor,
                  currency,
                },
                {
                  key: 'liabilities',
                  label: 'Liabilities',
                  amountMinor: snapshot.liabilitiesBaseMinor,
                  currency,
                },
                {
                  key: 'net-worth',
                  label: 'Net worth',
                  amountMinor: snapshot.netWorthBaseMinor,
                  currency,
                },
              ],
            };
          }
          default: {
            const _exhaustive: never = kind;
            throw new ProblemError('validation_failed', { detail: `Unknown report kind ${_exhaustive}` });
          }
        }
      });
    },

    listFxRates(
      accountId: string,
      query: {
        readonly limit: number;
        readonly after: readonly [string, string] | null;
        readonly quote?: string | undefined;
        readonly on?: string | undefined;
      },
    ): Promise<Page<FxRate>> {
      return inAccount(accountId, async (tx) =>
        pageOfKeyed(
          await repo.listFxRates(tx, query),
          query.limit,
          fxRateView,
          (row) => [row.rateDate, row.quote] as const,
        ),
      );
    },
  };
}

/** Family finance service. */
export type FinanceService = ReturnType<typeof createFinanceService>;
