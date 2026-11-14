import { z } from 'zod';
import { currencySchema, instantSchema, localDateSchema, pageSchema, uuidSchema } from './common.js';

/** High-level type of a finance ledger account. */
export const FIN_ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'income', 'expense'] as const;
/** High-level type of a finance ledger account. */
export type FinAccountType = (typeof FIN_ACCOUNT_TYPES)[number];

/** Concrete subtype of a finance ledger account. */
export const FIN_ACCOUNT_SUBTYPES = [
  'cash',
  'bank',
  'card',
  'savings',
  'piggy_bank',
  'loan',
  'mortgage',
  'investment',
  'currency_exchange',
  'opening_balance',
  'category',
] as const;
/** Concrete subtype of a finance ledger account. */
export type FinAccountSubtype = (typeof FIN_ACCOUNT_SUBTYPES)[number];

/** Clearing state of a finance transaction. */
export const FIN_TRANSACTION_STATUSES = ['pending', 'cleared', 'reconciled'] as const;
/** Clearing state of a finance transaction. */
export type FinTransactionStatus = (typeof FIN_TRANSACTION_STATUSES)[number];

/** Cadence of a budget limit. */
export const FIN_BUDGET_PERIODS = ['monthly', 'yearly'] as const;
/** Cadence of a budget limit. */
export type FinBudgetPeriod = (typeof FIN_BUDGET_PERIODS)[number];

/** Kind of finance report. */
export const FIN_REPORT_KINDS = ['balances', 'income-expense', 'by-category', 'net-worth'] as const;
/** Kind of finance report. */
export type FinReportKind = (typeof FIN_REPORT_KINDS)[number];

const nameSchema = z.string().trim().min(1).max(120);
const descriptionSchema = z.string().trim().min(1).max(200);
const payeeSchema = z.string().trim().min(1).max(120);
const notesSchema = z.string().trim().max(2000);
const memoSchema = z.string().trim().max(200);
const tagSchema = z.string().trim().min(1).max(40);
const tagsSchema = z.array(tagSchema).max(32);
const amountSchema = z.int().refine((value) => value !== 0, { message: 'Amount must be non-zero' });
const positiveAmountSchema = z.int().positive().max(1_000_000_000_000);
const fxRateSchema = z.number().positive().max(1_000_000);
const rruleSchema = z
  .string()
  .trim()
  .min(1)
  .max(400)
  .regex(/^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)(;[A-Z0-9=-]+)*$/);
const limitField = z.coerce.number().int().min(1).max(200).default(50);
const cursorField = z.string().max(512).optional();
const accountTypeSchema = z.enum(FIN_ACCOUNT_TYPES);
const accountSubtypeSchema = z.enum(FIN_ACCOUNT_SUBTYPES);
const transactionStatusSchema = z.enum(FIN_TRANSACTION_STATUSES);
const budgetPeriodSchema = z.enum(FIN_BUDGET_PERIODS);
const reportKindSchema = z.enum(FIN_REPORT_KINDS);
const visibilitySchema = z.enum(['family', 'personal']);

function atLeastOneField(value: object): boolean {
  return Object.keys(value).length > 0;
}

/** One ledger account. */
export const finAccountSchema = z
  .object({
    id: uuidSchema,
    familyId: uuidSchema,
    visibility: visibilitySchema,
    ownerAccountId: uuidSchema.nullable(),
    residentId: uuidSchema.nullable(),
    type: accountTypeSchema,
    subtype: accountSubtypeSchema,
    name: nameSchema,
    currency: currencySchema,
    parentId: uuidSchema.nullable(),
    archivedAt: instantSchema.nullable(),
    version: z.int().min(1),
    createdAt: instantSchema,
    updatedAt: instantSchema,
  })
  .strict()
  .meta({ id: 'FinAccount' });
/** One ledger account. */
export type FinAccount = z.infer<typeof finAccountSchema>;

/** Page of ledger accounts. */
export const finAccountPageSchema = pageSchema(finAccountSchema).meta({ id: 'FinAccountPage' });
/** Page of ledger accounts. */
export type FinAccountPage = z.infer<typeof finAccountPageSchema>;

/** Body to create a ledger account. */
export const createFinAccountRequestSchema = z
  .object({
    visibility: visibilitySchema.optional(),
    ownerAccountId: uuidSchema.nullable().optional(),
    residentId: uuidSchema.nullable().optional(),
    type: accountTypeSchema,
    subtype: accountSubtypeSchema,
    name: nameSchema,
    currency: currencySchema,
    parentId: uuidSchema.nullable().optional(),
  })
  .strict()
  .meta({ id: 'CreateFinAccountRequest' });
/** Body to create a ledger account. */
export type CreateFinAccountRequest = z.infer<typeof createFinAccountRequestSchema>;

/** Body to update a ledger account. */
export const updateFinAccountRequestSchema = z
  .object({
    name: nameSchema.optional(),
    parentId: uuidSchema.nullable().optional(),
    residentId: uuidSchema.nullable().optional(),
    archivedAt: instantSchema.nullable().optional(),
  })
  .strict()
  .refine(atLeastOneField, { message: 'At least one field is required' })
  .meta({ id: 'UpdateFinAccountRequest' });
/** Body to update a ledger account. */
export type UpdateFinAccountRequest = z.infer<typeof updateFinAccountRequestSchema>;

/** Path parameters of one ledger account. */
export const finAccountParamsSchema = z.object({ familyId: uuidSchema, accountId: uuidSchema }).strict();
/** Path parameters of one ledger account. */
export type FinAccountParams = z.infer<typeof finAccountParamsSchema>;

/** Query of the account list. */
export const finAccountListQuerySchema = z
  .object({
    limit: limitField,
    cursor: cursorField,
    type: accountTypeSchema.optional(),
    subtype: accountSubtypeSchema.optional(),
    includeArchived: z.coerce.boolean().optional(),
  })
  .strict();
/** Query of the account list. */
export type FinAccountListQuery = z.infer<typeof finAccountListQuerySchema>;

/** One posting line of a transaction. */
export const finPostingSchema = z
  .object({
    id: uuidSchema,
    accountId: uuidSchema,
    amountMinor: amountSchema,
    currency: currencySchema,
    fxRate: fxRateSchema,
    baseAmountMinor: z.int(),
    memo: memoSchema.nullable(),
  })
  .strict()
  .meta({ id: 'FinPosting' });
/** One posting line of a transaction. */
export type FinPosting = z.infer<typeof finPostingSchema>;

/** One posting line in a create/update body. */
export const finPostingInputSchema = z
  .object({
    accountId: uuidSchema,
    amountMinor: amountSchema,
    currency: currencySchema,
    fxRate: fxRateSchema.optional(),
    memo: memoSchema.nullable().optional(),
  })
  .strict();
/** One posting line in a create/update body. */
export type FinPostingInput = z.infer<typeof finPostingInputSchema>;

/** One split share of an expense. */
export const finSplitShareSchema = z
  .object({
    id: uuidSchema,
    transactionId: uuidSchema,
    residentId: uuidSchema,
    shareMinor: positiveAmountSchema,
    currency: currencySchema,
    settledTransactionId: uuidSchema.nullable(),
  })
  .strict()
  .meta({ id: 'FinSplitShare' });
/** One split share of an expense. */
export type FinSplitShare = z.infer<typeof finSplitShareSchema>;

/** One double-entry transaction with postings and optional splits. */
export const finTransactionSchema = z
  .object({
    id: uuidSchema,
    familyId: uuidSchema,
    bookedOn: localDateSchema,
    description: descriptionSchema,
    payee: payeeSchema.nullable(),
    status: transactionStatusSchema,
    recurringId: uuidSchema.nullable(),
    tags: tagsSchema,
    notes: notesSchema.nullable(),
    postings: z.array(finPostingSchema).min(2).max(64),
    splits: z.array(finSplitShareSchema).max(32),
    version: z.int().min(1),
    createdAt: instantSchema,
    updatedAt: instantSchema,
  })
  .strict()
  .meta({ id: 'FinTransaction' });
/** One double-entry transaction with postings and optional splits. */
export type FinTransaction = z.infer<typeof finTransactionSchema>;

/** Page of transactions. */
export const finTransactionPageSchema = pageSchema(finTransactionSchema).meta({
  id: 'FinTransactionPage',
});
/** Page of transactions. */
export type FinTransactionPage = z.infer<typeof finTransactionPageSchema>;

/** Body to create a transaction. */
export const createFinTransactionRequestSchema = z
  .object({
    bookedOn: localDateSchema,
    description: descriptionSchema,
    payee: payeeSchema.nullable().optional(),
    status: transactionStatusSchema.optional(),
    tags: tagsSchema.optional(),
    notes: notesSchema.nullable().optional(),
    postings: z.array(finPostingInputSchema).min(2).max(64),
  })
  .strict()
  .meta({ id: 'CreateFinTransactionRequest' });
/** Body to create a transaction. */
export type CreateFinTransactionRequest = z.infer<typeof createFinTransactionRequestSchema>;

/** Body to update a transaction header (postings are replaced via a dedicated body when provided). */
export const updateFinTransactionRequestSchema = z
  .object({
    bookedOn: localDateSchema.optional(),
    description: descriptionSchema.optional(),
    payee: payeeSchema.nullable().optional(),
    status: transactionStatusSchema.optional(),
    tags: tagsSchema.optional(),
    notes: notesSchema.nullable().optional(),
    postings: z.array(finPostingInputSchema).min(2).max(64).optional(),
  })
  .strict()
  .refine(atLeastOneField, { message: 'At least one field is required' })
  .meta({ id: 'UpdateFinTransactionRequest' });
/** Body to update a transaction. */
export type UpdateFinTransactionRequest = z.infer<typeof updateFinTransactionRequestSchema>;

/** Path parameters of one transaction. */
export const finTransactionParamsSchema = z
  .object({ familyId: uuidSchema, transactionId: uuidSchema })
  .strict();
/** Path parameters of one transaction. */
export type FinTransactionParams = z.infer<typeof finTransactionParamsSchema>;

/** Query of the transaction list. */
export const finTransactionListQuerySchema = z
  .object({
    limit: limitField,
    cursor: cursorField,
    from: localDateSchema.optional(),
    to: localDateSchema.optional(),
    accountId: uuidSchema.optional(),
  })
  .strict();
/** Query of the transaction list. */
export type FinTransactionListQuery = z.infer<typeof finTransactionListQuerySchema>;

/** Body to replace expense split shares on a transaction. */
export const putFinSplitsRequestSchema = z
  .object({
    shares: z
      .array(
        z
          .object({
            residentId: uuidSchema,
            shareMinor: positiveAmountSchema,
            currency: currencySchema,
            settledTransactionId: uuidSchema.nullable().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(32),
  })
  .strict()
  .meta({ id: 'PutFinSplitsRequest' });
/** Body to replace expense split shares on a transaction. */
export type PutFinSplitsRequest = z.infer<typeof putFinSplitsRequestSchema>;

/** Ledger page for one account. */
export const finAccountLedgerSchema = z
  .object({
    account: finAccountSchema,
    balanceMinor: z.int(),
    baseBalanceMinor: z.int(),
    items: z.array(finTransactionSchema),
    nextCursor: z.string().nullable(),
  })
  .strict()
  .meta({ id: 'FinAccountLedger' });
/** Ledger page for one account. */
export type FinAccountLedger = z.infer<typeof finAccountLedgerSchema>;

/** Query of an account ledger. */
export const finAccountLedgerQuerySchema = z
  .object({
    limit: limitField,
    cursor: cursorField,
    from: localDateSchema.optional(),
    to: localDateSchema.optional(),
  })
  .strict();
/** Query of an account ledger. */
export type FinAccountLedgerQuery = z.infer<typeof finAccountLedgerQuerySchema>;

/** One budget limit. */
export const finBudgetSchema = z
  .object({
    id: uuidSchema,
    familyId: uuidSchema,
    accountId: uuidSchema,
    period: budgetPeriodSchema,
    startsOn: localDateSchema,
    amountMinor: positiveAmountSchema,
    currency: currencySchema,
    rollover: z.boolean(),
    spentMinor: z.int(),
    version: z.int().min(1),
    createdAt: instantSchema,
    updatedAt: instantSchema,
  })
  .strict()
  .meta({ id: 'FinBudget' });
/** One budget limit. */
export type FinBudget = z.infer<typeof finBudgetSchema>;

/** Page of budgets. */
export const finBudgetPageSchema = pageSchema(finBudgetSchema).meta({ id: 'FinBudgetPage' });
/** Page of budgets. */
export type FinBudgetPage = z.infer<typeof finBudgetPageSchema>;

/** Body to create a budget. */
export const createFinBudgetRequestSchema = z
  .object({
    accountId: uuidSchema,
    period: budgetPeriodSchema,
    startsOn: localDateSchema,
    amountMinor: positiveAmountSchema,
    currency: currencySchema,
    rollover: z.boolean().optional(),
  })
  .strict()
  .meta({ id: 'CreateFinBudgetRequest' });
/** Body to create a budget. */
export type CreateFinBudgetRequest = z.infer<typeof createFinBudgetRequestSchema>;

/** Body to update a budget. */
export const updateFinBudgetRequestSchema = z
  .object({
    amountMinor: positiveAmountSchema.optional(),
    rollover: z.boolean().optional(),
    startsOn: localDateSchema.optional(),
  })
  .strict()
  .refine(atLeastOneField, { message: 'At least one field is required' })
  .meta({ id: 'UpdateFinBudgetRequest' });
/** Body to update a budget. */
export type UpdateFinBudgetRequest = z.infer<typeof updateFinBudgetRequestSchema>;

/** Path parameters of one budget. */
export const finBudgetParamsSchema = z.object({ familyId: uuidSchema, budgetId: uuidSchema }).strict();
/** Path parameters of one budget. */
export type FinBudgetParams = z.infer<typeof finBudgetParamsSchema>;

/** Query of the budget list. */
export const finBudgetListQuerySchema = z
  .object({
    limit: limitField,
    cursor: cursorField,
  })
  .strict();
/** Query of the budget list. */
export type FinBudgetListQuery = z.infer<typeof finBudgetListQuerySchema>;

/** One savings goal. */
export const finSavingsGoalSchema = z
  .object({
    id: uuidSchema,
    familyId: uuidSchema,
    residentId: uuidSchema.nullable(),
    accountId: uuidSchema,
    name: nameSchema,
    targetMinor: positiveAmountSchema,
    targetDate: localDateSchema.nullable(),
    balanceMinor: z.int(),
    version: z.int().min(1),
    createdAt: instantSchema,
    updatedAt: instantSchema,
  })
  .strict()
  .meta({ id: 'FinSavingsGoal' });
/** One savings goal. */
export type FinSavingsGoal = z.infer<typeof finSavingsGoalSchema>;

/** Page of savings goals. */
export const finSavingsGoalPageSchema = pageSchema(finSavingsGoalSchema).meta({
  id: 'FinSavingsGoalPage',
});
/** Page of savings goals. */
export type FinSavingsGoalPage = z.infer<typeof finSavingsGoalPageSchema>;

/** Body to create a savings goal. */
export const createFinSavingsGoalRequestSchema = z
  .object({
    accountId: uuidSchema,
    residentId: uuidSchema.nullable().optional(),
    name: nameSchema,
    targetMinor: positiveAmountSchema,
    targetDate: localDateSchema.nullable().optional(),
  })
  .strict()
  .meta({ id: 'CreateFinSavingsGoalRequest' });
/** Body to create a savings goal. */
export type CreateFinSavingsGoalRequest = z.infer<typeof createFinSavingsGoalRequestSchema>;

/** Body to update a savings goal. */
export const updateFinSavingsGoalRequestSchema = z
  .object({
    name: nameSchema.optional(),
    targetMinor: positiveAmountSchema.optional(),
    targetDate: localDateSchema.nullable().optional(),
    residentId: uuidSchema.nullable().optional(),
  })
  .strict()
  .refine(atLeastOneField, { message: 'At least one field is required' })
  .meta({ id: 'UpdateFinSavingsGoalRequest' });
/** Body to update a savings goal. */
export type UpdateFinSavingsGoalRequest = z.infer<typeof updateFinSavingsGoalRequestSchema>;

/** Path parameters of one savings goal. */
export const finSavingsGoalParamsSchema = z.object({ familyId: uuidSchema, goalId: uuidSchema }).strict();
/** Path parameters of one savings goal. */
export type FinSavingsGoalParams = z.infer<typeof finSavingsGoalParamsSchema>;

/** Query of the savings goal list. */
export const finSavingsGoalListQuerySchema = z
  .object({
    limit: limitField,
    cursor: cursorField,
  })
  .strict();
/** Query of the savings goal list. */
export type FinSavingsGoalListQuery = z.infer<typeof finSavingsGoalListQuerySchema>;

/** One posting line inside a recurring template. */
export const finRecurringPostingTemplateSchema = z
  .object({
    accountId: uuidSchema,
    amountMinor: amountSchema,
    currency: currencySchema,
    memo: memoSchema.nullable(),
  })
  .strict();
/** One posting line inside a recurring template. */
export type FinRecurringPostingTemplate = z.infer<typeof finRecurringPostingTemplateSchema>;

/** Template body of a recurring entry. */
export const finRecurringTemplateSchema = z
  .object({
    description: descriptionSchema,
    payee: payeeSchema.nullable(),
    tags: tagsSchema,
    notes: notesSchema.nullable(),
    postings: z.array(finRecurringPostingTemplateSchema).min(2).max(64),
  })
  .strict();
/** Template body of a recurring entry. */
export type FinRecurringTemplate = z.infer<typeof finRecurringTemplateSchema>;

/** One recurring entry. */
export const finRecurringSchema = z
  .object({
    id: uuidSchema,
    familyId: uuidSchema,
    description: descriptionSchema,
    rrule: rruleSchema,
    nextRunOn: localDateSchema,
    endOn: localDateSchema.nullable(),
    template: finRecurringTemplateSchema,
    autoPost: z.boolean(),
    active: z.boolean(),
    version: z.int().min(1),
    createdAt: instantSchema,
    updatedAt: instantSchema,
  })
  .strict()
  .meta({ id: 'FinRecurring' });
/** One recurring entry. */
export type FinRecurring = z.infer<typeof finRecurringSchema>;

/** Page of recurring entries. */
export const finRecurringPageSchema = pageSchema(finRecurringSchema).meta({ id: 'FinRecurringPage' });
/** Page of recurring entries. */
export type FinRecurringPage = z.infer<typeof finRecurringPageSchema>;

/** Body to create a recurring entry. */
export const createFinRecurringRequestSchema = z
  .object({
    description: descriptionSchema,
    rrule: rruleSchema,
    nextRunOn: localDateSchema,
    endOn: localDateSchema.nullable().optional(),
    template: finRecurringTemplateSchema,
    autoPost: z.boolean().optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .meta({ id: 'CreateFinRecurringRequest' });
/** Body to create a recurring entry. */
export type CreateFinRecurringRequest = z.infer<typeof createFinRecurringRequestSchema>;

/** Body to update a recurring entry. */
export const updateFinRecurringRequestSchema = z
  .object({
    description: descriptionSchema.optional(),
    rrule: rruleSchema.optional(),
    nextRunOn: localDateSchema.optional(),
    endOn: localDateSchema.nullable().optional(),
    template: finRecurringTemplateSchema.optional(),
    autoPost: z.boolean().optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .refine(atLeastOneField, { message: 'At least one field is required' })
  .meta({ id: 'UpdateFinRecurringRequest' });
/** Body to update a recurring entry. */
export type UpdateFinRecurringRequest = z.infer<typeof updateFinRecurringRequestSchema>;

/** Path parameters of one recurring entry. */
export const finRecurringParamsSchema = z.object({ familyId: uuidSchema, recurringId: uuidSchema }).strict();
/** Path parameters of one recurring entry. */
export type FinRecurringParams = z.infer<typeof finRecurringParamsSchema>;

/** Query of the recurring list. */
export const finRecurringListQuerySchema = z
  .object({
    limit: limitField,
    cursor: cursorField,
  })
  .strict();
/** Query of the recurring list. */
export type FinRecurringListQuery = z.infer<typeof finRecurringListQuerySchema>;

/** One foreign-exchange rate row. */
export const fxRateSchemaRow = z
  .object({
    base: currencySchema,
    quote: currencySchema,
    rateDate: localDateSchema,
    rate: fxRateSchema,
    source: z.string().min(1).max(40),
  })
  .strict()
  .meta({ id: 'FxRate' });
/** One foreign-exchange rate row. */
export type FxRate = z.infer<typeof fxRateSchemaRow>;

/** Page of foreign-exchange rates. */
export const fxRatePageSchema = pageSchema(fxRateSchemaRow).meta({ id: 'FxRatePage' });
/** Page of foreign-exchange rates. */
export type FxRatePage = z.infer<typeof fxRatePageSchema>;

/** Query of foreign-exchange rates. */
export const fxRateListQuerySchema = z
  .object({
    limit: limitField,
    cursor: cursorField,
    quote: currencySchema.optional(),
    on: localDateSchema.optional(),
  })
  .strict();
/** Query of foreign-exchange rates. */
export type FxRateListQuery = z.infer<typeof fxRateListQuerySchema>;

/** Path parameters of a finance report. */
export const finReportParamsSchema = z.object({ familyId: uuidSchema, kind: reportKindSchema }).strict();
/** Path parameters of a finance report. */
export type FinReportParams = z.infer<typeof finReportParamsSchema>;

/** Query of a finance report. */
export const finReportQuerySchema = z
  .object({
    from: localDateSchema,
    to: localDateSchema,
  })
  .strict();
/** Query of a finance report. */
export type FinReportQuery = z.infer<typeof finReportQuerySchema>;

/** One row of a finance report. */
export const finReportRowSchema = z
  .object({
    key: z.string().min(1).max(120),
    label: z.string().min(1).max(200),
    amountMinor: z.int(),
    currency: currencySchema,
  })
  .strict()
  .meta({ id: 'FinReportRow' });
/** One row of a finance report. */
export type FinReportRow = z.infer<typeof finReportRowSchema>;

/** Finance report payload. */
export const finReportSchema = z
  .object({
    kind: reportKindSchema,
    from: localDateSchema,
    to: localDateSchema,
    currency: currencySchema,
    rows: z.array(finReportRowSchema).max(500),
  })
  .strict()
  .meta({ id: 'FinReport' });
/** Finance report payload. */
export type FinReport = z.infer<typeof finReportSchema>;
