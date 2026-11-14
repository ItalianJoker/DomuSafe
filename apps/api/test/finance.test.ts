import type {
  FinAccount,
  FinBudget,
  FinRecurring,
  FinReport,
  FinSavingsGoal,
  FinTransaction,
  ProblemDetails,
  Resident,
} from '@domusafe/contracts';
import { formatEtag } from '@domusafe/contracts';
import type { LightMyRequestResponse } from 'fastify';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, createTestApp, type TestApp } from './helpers.js';

const PASSWORD = 'una-password-lunga-42';
const BOOKED_ON = '2026-11-14';
const BUDGET_STARTS_ON = '2026-11-01';
const REPORT_FROM = '2026-11-01';
const REPORT_TO = '2026-11-30';

let ctx: TestApp;
let admin: pg.Pool;
let alice: Client;
let familyId: string;
let houseId: string;
let bankAccount: FinAccount;
let expenseAccount: FinAccount;
let savingsAccount: FinAccount;
let expenseTransaction: FinTransaction;
let residentAId: string;
let residentBId: string;

function problem(response: LightMyRequestResponse): ProblemDetails {
  return response.json<ProblemDetails>();
}

function financeUrl(suffix = ''): string {
  return `/api/v1/families/${familyId}/finance${suffix}`;
}

function accountsUrl(suffix = ''): string {
  return financeUrl(`/accounts${suffix}`);
}

function transactionsUrl(suffix = ''): string {
  return financeUrl(`/transactions${suffix}`);
}

function budgetsUrl(suffix = ''): string {
  return financeUrl(`/budgets${suffix}`);
}

function savingsUrl(suffix = ''): string {
  return financeUrl(`/savings-goals${suffix}`);
}

function recurringUrl(suffix = ''): string {
  return financeUrl(`/recurring${suffix}`);
}

function reportsUrl(kind: string): string {
  return financeUrl(`/reports/${kind}?from=${REPORT_FROM}&to=${REPORT_TO}`);
}

function residentsUrl(suffix = ''): string {
  return `/api/v1/families/${familyId}/residents${suffix}`;
}

beforeAll(async () => {
  ctx = await createTestApp();
  admin = new pg.Pool({ connectionString: ctx.database.adminUrl, max: 2 });
  alice = new Client(ctx.app);
  await alice.signUp('Alice Finanza', 'alice-finance@example.test', PASSWORD);
  const created = await alice.create('/api/v1/families', {
    name: 'Famiglia Finanza',
    firstHouse: { name: 'Casa finanza' },
  });
  expect(created.statusCode).toBe(201);
  const body = created.json<{ family: { id: string; plan: { tier: string } }; house: { id: string } }>();
  familyId = body.family.id;
  houseId = body.house.id;
  expect(body.family.plan.tier).toBe('free');
});

afterAll(async () => {
  await admin.end();
  await ctx.close();
});

describe('family finance ledger', () => {
  it('rejects account creation on Free with plan_required basic', async () => {
    const response = await alice.create(accountsUrl(), {
      type: 'asset',
      subtype: 'bank',
      name: 'Conto corrente',
      currency: 'EUR',
    });
    expect(response.statusCode).toBe(403);
    expect(problem(response).code).toBe('plan_required');
    expect(problem(response).requiredPlan).toBe('basic');
  });

  it('upgrades to basic and creates bank and expense category accounts', async () => {
    await admin.query(`update families set plan = 'basic' where id = $1`, [familyId]);

    const bank = await alice.create(accountsUrl(), {
      type: 'asset',
      subtype: 'bank',
      name: 'Conto corrente',
      currency: 'EUR',
    });
    expect(bank.statusCode, bank.body).toBe(201);
    bankAccount = bank.json<FinAccount>();
    expect(bankAccount).toMatchObject({
      type: 'asset',
      subtype: 'bank',
      name: 'Conto corrente',
      currency: 'EUR',
      version: 1,
    });
    expect(bank.headers.etag).toBe(formatEtag(1));

    const expense = await alice.create(accountsUrl(), {
      type: 'expense',
      subtype: 'category',
      name: 'Spesa alimentare',
      currency: 'EUR',
    });
    expect(expense.statusCode, expense.body).toBe(201);
    expenseAccount = expense.json<FinAccount>();
    expect(expenseAccount).toMatchObject({
      type: 'expense',
      subtype: 'category',
      name: 'Spesa alimentare',
      currency: 'EUR',
    });

    const listed = await alice.request('GET', accountsUrl());
    expect(listed.statusCode).toBe(200);
    const ids = listed.json<{ items: FinAccount[] }>().items.map((item) => item.id);
    expect(ids).toEqual(expect.arrayContaining([bankAccount.id, expenseAccount.id]));
  });

  it('creates a balanced expense transaction and lists it', async () => {
    const created = await alice.create(transactionsUrl(), {
      bookedOn: BOOKED_ON,
      description: 'Spesa al mercato',
      payee: 'Mercato',
      postings: [
        { accountId: expenseAccount.id, amountMinor: 50_00, currency: 'EUR' },
        { accountId: bankAccount.id, amountMinor: -50_00, currency: 'EUR' },
      ],
    });
    expect(created.statusCode, created.body).toBe(201);
    expenseTransaction = created.json<FinTransaction>();
    expect(expenseTransaction.description).toBe('Spesa al mercato');
    expect(expenseTransaction.postings).toHaveLength(2);
    expect(expenseTransaction.splits).toEqual([]);
    expect(created.headers.etag).toBe(formatEtag(1));

    const listed = await alice.request('GET', transactionsUrl());
    expect(listed.statusCode).toBe(200);
    expect(
      listed.json<{ items: FinTransaction[] }>().items.some((item) => item.id === expenseTransaction.id),
    ).toBe(true);
  });

  it('rejects an unbalanced transaction', async () => {
    const response = await alice.create(transactionsUrl(), {
      bookedOn: BOOKED_ON,
      description: 'Movimento sbilanciato',
      postings: [
        { accountId: expenseAccount.id, amountMinor: 30_00, currency: 'EUR' },
        { accountId: bankAccount.id, amountMinor: -10_00, currency: 'EUR' },
      ],
    });
    expect([400, 422]).toContain(response.statusCode);
    expect(['domain_rule_violated', 'validation_failed']).toContain(problem(response).code);
  });

  it('creates a budget on the expense category and reports spentMinor', async () => {
    const created = await alice.create(budgetsUrl(), {
      accountId: expenseAccount.id,
      period: 'monthly',
      startsOn: BUDGET_STARTS_ON,
      amountMinor: 200_00,
      currency: 'EUR',
    });
    expect(created.statusCode, created.body).toBe(201);
    const budget = created.json<FinBudget>();
    expect(budget.accountId).toBe(expenseAccount.id);
    expect(budget.amountMinor).toBe(200_00);
    expect(budget.spentMinor).toBe(50_00);

    const listed = await alice.request('GET', budgetsUrl());
    expect(listed.statusCode).toBe(200);
    const found = listed.json<{ items: FinBudget[] }>().items.find((item) => item.id === budget.id);
    expect(found).toBeDefined();
    expect(found?.spentMinor).toBe(50_00);
  });

  it('creates a savings goal on a savings account', async () => {
    const savings = await alice.create(accountsUrl(), {
      type: 'asset',
      subtype: 'savings',
      name: 'Fondo vacanze',
      currency: 'EUR',
    });
    expect(savings.statusCode, savings.body).toBe(201);
    savingsAccount = savings.json<FinAccount>();

    const created = await alice.create(savingsUrl(), {
      accountId: savingsAccount.id,
      name: 'Vacanze estive',
      targetMinor: 1_000_00,
      targetDate: '2027-06-30',
    });
    expect(created.statusCode, created.body).toBe(201);
    const goal = created.json<FinSavingsGoal>();
    expect(goal).toMatchObject({
      accountId: savingsAccount.id,
      name: 'Vacanze estive',
      targetMinor: 1_000_00,
      balanceMinor: 0,
    });

    const listed = await alice.request('GET', savingsUrl());
    expect(listed.statusCode).toBe(200);
    expect(listed.json<{ items: FinSavingsGoal[] }>().items.some((item) => item.id === goal.id)).toBe(true);
  });

  it('creates a recurring template and materialises a transaction on run', async () => {
    const created = await alice.create(recurringUrl(), {
      description: 'Affitto mensile',
      rrule: 'FREQ=MONTHLY',
      nextRunOn: BOOKED_ON,
      template: {
        description: 'Affitto mensile',
        payee: 'Proprietario',
        tags: ['casa'],
        notes: null,
        postings: [
          { accountId: expenseAccount.id, amountMinor: 80_00, currency: 'EUR', memo: null },
          { accountId: bankAccount.id, amountMinor: -80_00, currency: 'EUR', memo: null },
        ],
      },
    });
    expect(created.statusCode, created.body).toBe(201);
    const recurring = created.json<FinRecurring>();
    expect(recurring.nextRunOn).toBe(BOOKED_ON);
    expect(recurring.active).toBe(true);

    const run = await alice.create(recurringUrl(`/${recurring.id}/run`), {});
    expect(run.statusCode, run.body).toBe(201);
    const posted = run.json<FinTransaction>();
    expect(posted.recurringId).toBe(recurring.id);
    expect(posted.description).toBe('Affitto mensile');
    expect(posted.postings).toHaveLength(2);

    const listed = await alice.request('GET', transactionsUrl());
    expect(listed.statusCode).toBe(200);
    expect(listed.json<{ items: FinTransaction[] }>().items.some((item) => item.id === posted.id)).toBe(true);
  });

  it('puts expense splits across two residents', async () => {
    const first = await alice.create(residentsUrl(), {
      displayName: 'Alice',
      kind: 'adult',
      houseIds: [houseId],
    });
    expect(first.statusCode, first.body).toBe(201);
    residentAId = first.json<Resident>().id;

    const second = await alice.create(residentsUrl(), {
      displayName: 'Marco',
      kind: 'adult',
      houseIds: [houseId],
    });
    expect(second.statusCode, second.body).toBe(201);
    residentBId = second.json<Resident>().id;

    const splits = await alice.request('PUT', transactionsUrl(`/${expenseTransaction.id}/splits`), {
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: {
        shares: [
          { residentId: residentAId, shareMinor: 30_00, currency: 'EUR' },
          { residentId: residentBId, shareMinor: 20_00, currency: 'EUR' },
        ],
      },
    });
    expect(splits.statusCode, splits.body).toBe(200);
    const body = splits.json<FinTransaction>();
    expect(body.version).toBe(expenseTransaction.version + 1);
    expect(body.splits).toHaveLength(2);
    expect(body.splits.map((share) => share.residentId).sort()).toEqual([residentAId, residentBId].sort());
    expect(body.splits.reduce((sum, share) => sum + share.shareMinor, 0)).toBe(50_00);
    expenseTransaction = body;
  });

  it('returns balances and income-expense reports', async () => {
    const balances = await alice.request('GET', reportsUrl('balances'));
    expect(balances.statusCode, balances.body).toBe(200);
    const balancesBody = balances.json<FinReport>();
    expect(balancesBody.kind).toBe('balances');
    expect(balancesBody.currency).toBe('EUR');
    expect(balancesBody.rows.length).toBeGreaterThan(0);
    expect(balancesBody.rows.some((row) => row.key === bankAccount.id)).toBe(true);
    expect(balancesBody.rows.some((row) => row.key === expenseAccount.id)).toBe(true);

    const incomeExpense = await alice.request('GET', reportsUrl('income-expense'));
    expect(incomeExpense.statusCode, incomeExpense.body).toBe(200);
    const ieBody = incomeExpense.json<FinReport>();
    expect(ieBody.kind).toBe('income-expense');
    expect(ieBody.rows.some((row) => row.key === 'expense')).toBe(true);
    const expenseRow = ieBody.rows.find((row) => row.key === 'expense');
    expect(expenseRow?.amountMinor).toBeGreaterThanOrEqual(50_00);
  });

  it('soft-deletes a transaction and an account', async () => {
    const disposable = await alice.create(accountsUrl(), {
      type: 'asset',
      subtype: 'cash',
      name: 'Cassa da chiudere',
      currency: 'EUR',
    });
    expect(disposable.statusCode, disposable.body).toBe(201);
    const disposableAccount = disposable.json<FinAccount>();

    const loaded = await alice.request('GET', transactionsUrl(`/${expenseTransaction.id}`));
    expect(loaded.statusCode).toBe(200);
    const current = loaded.json<FinTransaction>();

    const deletedTx = await alice.request('DELETE', transactionsUrl(`/${current.id}`), {
      headers: { 'if-match': formatEtag(current.version) },
    });
    expect(deletedTx.statusCode, deletedTx.body).toBe(204);

    const listedTx = await alice.request('GET', transactionsUrl());
    expect(listedTx.statusCode).toBe(200);
    expect(listedTx.json<{ items: FinTransaction[] }>().items.some((item) => item.id === current.id)).toBe(
      false,
    );

    const deletedAccount = await alice.request('DELETE', accountsUrl(`/${disposableAccount.id}`), {
      headers: { 'if-match': formatEtag(disposableAccount.version) },
    });
    expect(deletedAccount.statusCode, deletedAccount.body).toBe(204);

    const listedAccounts = await alice.request('GET', accountsUrl());
    expect(listedAccounts.statusCode).toBe(200);
    expect(
      listedAccounts.json<{ items: FinAccount[] }>().items.some((item) => item.id === disposableAccount.id),
    ).toBe(false);
  });
});
