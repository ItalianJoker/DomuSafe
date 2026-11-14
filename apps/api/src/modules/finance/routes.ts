import {
  createFinAccountRequestSchema,
  createFinBudgetRequestSchema,
  createFinRecurringRequestSchema,
  createFinSavingsGoalRequestSchema,
  createFinTransactionRequestSchema,
  familyParamsSchema,
  finAccountLedgerQuerySchema,
  finAccountLedgerSchema,
  finAccountListQuerySchema,
  finAccountPageSchema,
  finAccountParamsSchema,
  finAccountSchema,
  finBudgetListQuerySchema,
  finBudgetPageSchema,
  finBudgetParamsSchema,
  finBudgetSchema,
  finRecurringListQuerySchema,
  finRecurringPageSchema,
  finRecurringParamsSchema,
  finRecurringSchema,
  finReportParamsSchema,
  finReportQuerySchema,
  finReportSchema,
  finSavingsGoalListQuerySchema,
  finSavingsGoalPageSchema,
  finSavingsGoalParamsSchema,
  finSavingsGoalSchema,
  finTransactionListQuerySchema,
  finTransactionPageSchema,
  finTransactionParamsSchema,
  finTransactionSchema,
  formatEtag,
  fxRateListQuerySchema,
  fxRatePageSchema,
  putFinSplitsRequestSchema,
  updateFinAccountRequestSchema,
  updateFinBudgetRequestSchema,
  updateFinRecurringRequestSchema,
  updateFinSavingsGoalRequestSchema,
  updateFinTransactionRequestSchema,
} from '@domusafe/contracts';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  idempotencyHeaders,
  ifMatchHeaders,
  instantCursor,
  problemResponses,
  requireIfMatch,
} from '../../http/conventions.js';
import { ProblemError } from '../../http/problem.js';
import type { AuthenticatedAccount, TenantContext } from '../../types.js';
import type { FinanceService } from './service.js';

function tenantOf(request: { tenant: TenantContext | null }): TenantContext {
  if (request.tenant === null) {
    throw new ProblemError('not_found');
  }
  return request.tenant;
}

function caller(request: { account: AuthenticatedAccount | null }): AuthenticatedAccount {
  if (request.account === null) {
    throw new ProblemError('unauthenticated');
  }
  return request.account;
}

/**
 * Decodes an FX-rate list cursor whose second key is a currency code (not a UUID).
 *
 * Preconditions: `cursor` is absent on the first page, or opaque base64url from a prior page.
 * Postconditions: returns `[rateDate, quote]` or `null` for the first page.
 * Data contract: sort key is a calendar date; id is an ISO 4217 code.
 *
 * @param cursor - Opaque cursor or `undefined`.
 * @returns The position, or `null`.
 * @throws ProblemError `cursor_invalid`.
 */
function fxRateCursor(cursor: string | undefined): readonly [string, string] | null {
  if (cursor === undefined) {
    return null;
  }
  try {
    const padded = cursor.replaceAll('-', '+').replaceAll('_', '/');
    const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (
      Array.isArray(value) &&
      value.length === 2 &&
      typeof value[0] === 'string' &&
      typeof value[1] === 'string' &&
      !Number.isNaN(Date.parse(value[0])) &&
      /^[A-Z]{3}$/u.test(value[1])
    ) {
      return [value[0], value[1]];
    }
  } catch {
    // fall through
  }
  throw new ProblemError('cursor_invalid');
}

/**
 * Routes of the family finance ledger: accounts, transactions, budgets, savings, recurring, reports and FX rates.
 * Family routes require `finance.read` / `finance.write` and plan feature `finance`.
 *
 * @param app - Fastify instance with the Zod type provider.
 * @param options - Finance service.
 */
export const financeRoutes: FastifyPluginAsyncZod<{ finance: FinanceService }> = async (
  app,
  { finance },
) => {
  const family = '/api/v1/families/:familyId/finance';
  const accountsPath = `${family}/accounts`;
  const transactionsPath = `${family}/transactions`;
  const budgetsPath = `${family}/budgets`;
  const savingsPath = `${family}/savings-goals`;
  const recurringPath = `${family}/recurring`;
  const reportsPath = `${family}/reports`;

  app.get(
    '/api/v1/fx-rates',
    {
      config: { access: 'account' },
      schema: {
        tags: ['finance'],
        operationId: 'finance.listFxRates',
        summary: 'List foreign-exchange reference rates',
        querystring: fxRateListQuerySchema,
        response: { 200: fxRatePageSchema, ...problemResponses(400, 401) },
      },
    },
    async (request) =>
      finance.listFxRates(caller(request).id, {
        limit: request.query.limit,
        after: fxRateCursor(request.query.cursor),
        quote: request.query.quote,
        on: request.query.on,
      }),
  );

  app.get(
    accountsPath,
    {
      config: { access: 'family', permission: 'finance.read', planFeature: 'finance' },
      schema: {
        tags: ['finance'],
        operationId: 'finance.listAccounts',
        summary: 'List ledger accounts',
        params: familyParamsSchema,
        querystring: finAccountListQuerySchema,
        response: { 200: finAccountPageSchema, ...problemResponses(400, 401, 403, 404) },
      },
    },
    async (request) =>
      finance.listAccounts(tenantOf(request), {
        limit: request.query.limit,
        after: instantCursor(request.query.cursor),
        type: request.query.type,
        subtype: request.query.subtype,
        includeArchived: request.query.includeArchived,
      }),
  );

  app.post(
    accountsPath,
    {
      config: { access: 'family', permission: 'finance.write', planFeature: 'finance', idempotent: true },
      schema: {
        tags: ['finance'],
        operationId: 'finance.createAccount',
        summary: 'Create a ledger account',
        params: familyParamsSchema,
        headers: idempotencyHeaders,
        body: createFinAccountRequestSchema,
        response: { 201: finAccountSchema, ...problemResponses(400, 401, 403, 404, 409, 422) },
      },
    },
    async (request, reply) => {
      const tenant = tenantOf(request);
      const row = await finance.createAccount(tenant, request.body);
      void reply
        .status(201)
        .header('location', `/api/v1/families/${tenant.familyId}/finance/accounts/${row.id}`)
        .header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.patch(
    `${accountsPath}/:accountId`,
    {
      config: { access: 'family', permission: 'finance.write', planFeature: 'finance' },
      schema: {
        tags: ['finance'],
        operationId: 'finance.updateAccount',
        summary: 'Update a ledger account',
        params: finAccountParamsSchema,
        headers: ifMatchHeaders,
        body: updateFinAccountRequestSchema,
        response: { 200: finAccountSchema, ...problemResponses(400, 401, 403, 404, 409, 422, 428) },
      },
    },
    async (request, reply) => {
      const row = await finance.updateAccount(
        tenantOf(request),
        request.params.accountId,
        requireIfMatch(request),
        request.body,
      );
      void reply.header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.delete(
    `${accountsPath}/:accountId`,
    {
      config: { access: 'family', permission: 'finance.write', planFeature: 'finance' },
      schema: {
        tags: ['finance'],
        operationId: 'finance.deleteAccount',
        summary: 'Soft-delete a ledger account',
        params: finAccountParamsSchema,
        headers: ifMatchHeaders,
        response: { 204: z.null(), ...problemResponses(401, 403, 404, 409, 428) },
      },
    },
    async (request, reply) => {
      await finance.deleteAccount(tenantOf(request), request.params.accountId, requireIfMatch(request));
      return reply.status(204).send(null);
    },
  );

  app.get(
    `${accountsPath}/:accountId/ledger`,
    {
      config: { access: 'family', permission: 'finance.read', planFeature: 'finance' },
      schema: {
        tags: ['finance'],
        operationId: 'finance.getAccountLedger',
        summary: 'Get the ledger page of one account',
        params: finAccountParamsSchema,
        querystring: finAccountLedgerQuerySchema,
        response: { 200: finAccountLedgerSchema, ...problemResponses(400, 401, 403, 404) },
      },
    },
    async (request) =>
      finance.getAccountLedger(tenantOf(request), request.params.accountId, {
        limit: request.query.limit,
        after: instantCursor(request.query.cursor),
        from: request.query.from,
        to: request.query.to,
      }),
  );

  app.get(
    transactionsPath,
    {
      config: { access: 'family', permission: 'finance.read', planFeature: 'finance' },
      schema: {
        tags: ['finance'],
        operationId: 'finance.listTransactions',
        summary: 'List finance transactions',
        params: familyParamsSchema,
        querystring: finTransactionListQuerySchema,
        response: { 200: finTransactionPageSchema, ...problemResponses(400, 401, 403, 404) },
      },
    },
    async (request) =>
      finance.listTransactions(tenantOf(request), {
        limit: request.query.limit,
        after: instantCursor(request.query.cursor),
        from: request.query.from,
        to: request.query.to,
        accountId: request.query.accountId,
      }),
  );

  app.post(
    transactionsPath,
    {
      config: { access: 'family', permission: 'finance.write', planFeature: 'finance', idempotent: true },
      schema: {
        tags: ['finance'],
        operationId: 'finance.createTransaction',
        summary: 'Create a double-entry transaction',
        params: familyParamsSchema,
        headers: idempotencyHeaders,
        body: createFinTransactionRequestSchema,
        response: { 201: finTransactionSchema, ...problemResponses(400, 401, 403, 404, 409, 422) },
      },
    },
    async (request, reply) => {
      const tenant = tenantOf(request);
      const row = await finance.createTransaction(tenant, request.body);
      void reply
        .status(201)
        .header('location', `/api/v1/families/${tenant.familyId}/finance/transactions/${row.id}`)
        .header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.get(
    `${transactionsPath}/:transactionId`,
    {
      config: { access: 'family', permission: 'finance.read', planFeature: 'finance' },
      schema: {
        tags: ['finance'],
        operationId: 'finance.getTransaction',
        summary: 'Get one finance transaction',
        params: finTransactionParamsSchema,
        response: { 200: finTransactionSchema, ...problemResponses(401, 403, 404) },
      },
    },
    async (request, reply) => {
      const row = await finance.getTransaction(tenantOf(request), request.params.transactionId);
      void reply.header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.patch(
    `${transactionsPath}/:transactionId`,
    {
      config: { access: 'family', permission: 'finance.write', planFeature: 'finance' },
      schema: {
        tags: ['finance'],
        operationId: 'finance.updateTransaction',
        summary: 'Update a finance transaction',
        params: finTransactionParamsSchema,
        headers: ifMatchHeaders,
        body: updateFinTransactionRequestSchema,
        response: { 200: finTransactionSchema, ...problemResponses(400, 401, 403, 404, 409, 422, 428) },
      },
    },
    async (request, reply) => {
      const row = await finance.updateTransaction(
        tenantOf(request),
        request.params.transactionId,
        requireIfMatch(request),
        request.body,
      );
      void reply.header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.delete(
    `${transactionsPath}/:transactionId`,
    {
      config: { access: 'family', permission: 'finance.write', planFeature: 'finance' },
      schema: {
        tags: ['finance'],
        operationId: 'finance.deleteTransaction',
        summary: 'Soft-delete a finance transaction',
        params: finTransactionParamsSchema,
        headers: ifMatchHeaders,
        response: { 204: z.null(), ...problemResponses(401, 403, 404, 409, 428) },
      },
    },
    async (request, reply) => {
      await finance.deleteTransaction(
        tenantOf(request),
        request.params.transactionId,
        requireIfMatch(request),
      );
      return reply.status(204).send(null);
    },
  );

  app.put(
    `${transactionsPath}/:transactionId/splits`,
    {
      config: { access: 'family', permission: 'finance.write', planFeature: 'finance', idempotent: true },
      schema: {
        tags: ['finance'],
        operationId: 'finance.putSplits',
        summary: 'Replace expense split shares on a transaction',
        params: finTransactionParamsSchema,
        headers: idempotencyHeaders,
        body: putFinSplitsRequestSchema,
        response: { 200: finTransactionSchema, ...problemResponses(400, 401, 403, 404, 409, 422) },
      },
    },
    async (request, reply) => {
      const row = await finance.putSplits(
        tenantOf(request),
        request.params.transactionId,
        request.body,
      );
      void reply.header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.get(
    budgetsPath,
    {
      config: { access: 'family', permission: 'finance.read', planFeature: 'finance' },
      schema: {
        tags: ['finance'],
        operationId: 'finance.listBudgets',
        summary: 'List budgets',
        params: familyParamsSchema,
        querystring: finBudgetListQuerySchema,
        response: { 200: finBudgetPageSchema, ...problemResponses(400, 401, 403, 404) },
      },
    },
    async (request) =>
      finance.listBudgets(tenantOf(request), {
        limit: request.query.limit,
        after: instantCursor(request.query.cursor),
      }),
  );

  app.post(
    budgetsPath,
    {
      config: { access: 'family', permission: 'finance.write', planFeature: 'finance', idempotent: true },
      schema: {
        tags: ['finance'],
        operationId: 'finance.createBudget',
        summary: 'Create a budget',
        params: familyParamsSchema,
        headers: idempotencyHeaders,
        body: createFinBudgetRequestSchema,
        response: { 201: finBudgetSchema, ...problemResponses(400, 401, 403, 404, 409, 422) },
      },
    },
    async (request, reply) => {
      const tenant = tenantOf(request);
      const row = await finance.createBudget(tenant, request.body);
      void reply
        .status(201)
        .header('location', `/api/v1/families/${tenant.familyId}/finance/budgets/${row.id}`)
        .header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.patch(
    `${budgetsPath}/:budgetId`,
    {
      config: { access: 'family', permission: 'finance.write', planFeature: 'finance' },
      schema: {
        tags: ['finance'],
        operationId: 'finance.updateBudget',
        summary: 'Update a budget',
        params: finBudgetParamsSchema,
        headers: ifMatchHeaders,
        body: updateFinBudgetRequestSchema,
        response: { 200: finBudgetSchema, ...problemResponses(400, 401, 403, 404, 409, 422, 428) },
      },
    },
    async (request, reply) => {
      const row = await finance.updateBudget(
        tenantOf(request),
        request.params.budgetId,
        requireIfMatch(request),
        request.body,
      );
      void reply.header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.delete(
    `${budgetsPath}/:budgetId`,
    {
      config: { access: 'family', permission: 'finance.write', planFeature: 'finance' },
      schema: {
        tags: ['finance'],
        operationId: 'finance.deleteBudget',
        summary: 'Soft-delete a budget',
        params: finBudgetParamsSchema,
        headers: ifMatchHeaders,
        response: { 204: z.null(), ...problemResponses(401, 403, 404, 409, 428) },
      },
    },
    async (request, reply) => {
      await finance.deleteBudget(tenantOf(request), request.params.budgetId, requireIfMatch(request));
      return reply.status(204).send(null);
    },
  );

  app.get(
    savingsPath,
    {
      config: { access: 'family', permission: 'finance.read', planFeature: 'finance' },
      schema: {
        tags: ['finance'],
        operationId: 'finance.listSavingsGoals',
        summary: 'List savings goals',
        params: familyParamsSchema,
        querystring: finSavingsGoalListQuerySchema,
        response: { 200: finSavingsGoalPageSchema, ...problemResponses(400, 401, 403, 404) },
      },
    },
    async (request) =>
      finance.listSavingsGoals(tenantOf(request), {
        limit: request.query.limit,
        after: instantCursor(request.query.cursor),
      }),
  );

  app.post(
    savingsPath,
    {
      config: { access: 'family', permission: 'finance.write', planFeature: 'finance', idempotent: true },
      schema: {
        tags: ['finance'],
        operationId: 'finance.createSavingsGoal',
        summary: 'Create a savings goal',
        params: familyParamsSchema,
        headers: idempotencyHeaders,
        body: createFinSavingsGoalRequestSchema,
        response: { 201: finSavingsGoalSchema, ...problemResponses(400, 401, 403, 404, 409, 422) },
      },
    },
    async (request, reply) => {
      const tenant = tenantOf(request);
      const row = await finance.createSavingsGoal(tenant, request.body);
      void reply
        .status(201)
        .header('location', `/api/v1/families/${tenant.familyId}/finance/savings-goals/${row.id}`)
        .header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.patch(
    `${savingsPath}/:goalId`,
    {
      config: { access: 'family', permission: 'finance.write', planFeature: 'finance' },
      schema: {
        tags: ['finance'],
        operationId: 'finance.updateSavingsGoal',
        summary: 'Update a savings goal',
        params: finSavingsGoalParamsSchema,
        headers: ifMatchHeaders,
        body: updateFinSavingsGoalRequestSchema,
        response: { 200: finSavingsGoalSchema, ...problemResponses(400, 401, 403, 404, 409, 422, 428) },
      },
    },
    async (request, reply) => {
      const row = await finance.updateSavingsGoal(
        tenantOf(request),
        request.params.goalId,
        requireIfMatch(request),
        request.body,
      );
      void reply.header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.delete(
    `${savingsPath}/:goalId`,
    {
      config: { access: 'family', permission: 'finance.write', planFeature: 'finance' },
      schema: {
        tags: ['finance'],
        operationId: 'finance.deleteSavingsGoal',
        summary: 'Soft-delete a savings goal',
        params: finSavingsGoalParamsSchema,
        headers: ifMatchHeaders,
        response: { 204: z.null(), ...problemResponses(401, 403, 404, 409, 428) },
      },
    },
    async (request, reply) => {
      await finance.deleteSavingsGoal(tenantOf(request), request.params.goalId, requireIfMatch(request));
      return reply.status(204).send(null);
    },
  );

  app.get(
    recurringPath,
    {
      config: { access: 'family', permission: 'finance.read', planFeature: 'finance' },
      schema: {
        tags: ['finance'],
        operationId: 'finance.listRecurring',
        summary: 'List recurring transaction templates',
        params: familyParamsSchema,
        querystring: finRecurringListQuerySchema,
        response: { 200: finRecurringPageSchema, ...problemResponses(400, 401, 403, 404) },
      },
    },
    async (request) =>
      finance.listRecurring(tenantOf(request), {
        limit: request.query.limit,
        after: instantCursor(request.query.cursor),
      }),
  );

  app.post(
    recurringPath,
    {
      config: { access: 'family', permission: 'finance.write', planFeature: 'finance', idempotent: true },
      schema: {
        tags: ['finance'],
        operationId: 'finance.createRecurring',
        summary: 'Create a recurring transaction template',
        params: familyParamsSchema,
        headers: idempotencyHeaders,
        body: createFinRecurringRequestSchema,
        response: { 201: finRecurringSchema, ...problemResponses(400, 401, 403, 404, 409, 422) },
      },
    },
    async (request, reply) => {
      const tenant = tenantOf(request);
      const row = await finance.createRecurring(tenant, request.body);
      void reply
        .status(201)
        .header('location', `/api/v1/families/${tenant.familyId}/finance/recurring/${row.id}`)
        .header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.patch(
    `${recurringPath}/:recurringId`,
    {
      config: { access: 'family', permission: 'finance.write', planFeature: 'finance' },
      schema: {
        tags: ['finance'],
        operationId: 'finance.updateRecurring',
        summary: 'Update a recurring transaction template',
        params: finRecurringParamsSchema,
        headers: ifMatchHeaders,
        body: updateFinRecurringRequestSchema,
        response: { 200: finRecurringSchema, ...problemResponses(400, 401, 403, 404, 409, 422, 428) },
      },
    },
    async (request, reply) => {
      const row = await finance.updateRecurring(
        tenantOf(request),
        request.params.recurringId,
        requireIfMatch(request),
        request.body,
      );
      void reply.header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.delete(
    `${recurringPath}/:recurringId`,
    {
      config: { access: 'family', permission: 'finance.write', planFeature: 'finance' },
      schema: {
        tags: ['finance'],
        operationId: 'finance.deleteRecurring',
        summary: 'Soft-delete a recurring transaction template',
        params: finRecurringParamsSchema,
        headers: ifMatchHeaders,
        response: { 204: z.null(), ...problemResponses(401, 403, 404, 409, 428) },
      },
    },
    async (request, reply) => {
      await finance.deleteRecurring(
        tenantOf(request),
        request.params.recurringId,
        requireIfMatch(request),
      );
      return reply.status(204).send(null);
    },
  );

  app.post(
    `${recurringPath}/:recurringId/run`,
    {
      config: { access: 'family', permission: 'finance.write', planFeature: 'finance', idempotent: true },
      schema: {
        tags: ['finance'],
        operationId: 'finance.runRecurring',
        summary: 'Materialise the next run of a recurring template',
        params: finRecurringParamsSchema,
        headers: idempotencyHeaders,
        response: { 201: finTransactionSchema, ...problemResponses(400, 401, 403, 404, 409, 422) },
      },
    },
    async (request, reply) => {
      const tenant = tenantOf(request);
      const row = await finance.runRecurring(tenant, request.params.recurringId);
      void reply
        .status(201)
        .header('location', `/api/v1/families/${tenant.familyId}/finance/transactions/${row.id}`)
        .header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.get(
    `${reportsPath}/:kind`,
    {
      config: { access: 'family', permission: 'finance.read', planFeature: 'finance' },
      schema: {
        tags: ['finance'],
        operationId: 'finance.getReport',
        summary: 'Get a finance report for a date range',
        params: finReportParamsSchema,
        querystring: finReportQuerySchema,
        response: { 200: finReportSchema, ...problemResponses(400, 401, 403, 404) },
      },
    },
    async (request) =>
      finance.getReport(tenantOf(request), request.params.kind, request.query.from, request.query.to),
  );
};
