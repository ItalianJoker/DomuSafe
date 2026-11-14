import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type {
  FinAccount,
  FinAccountSubtype,
  FinAccountType,
  FinBudgetPeriod,
  FinTransaction,
  Me,
} from '@domusafe/contracts';
import {
  CURRENCY_CODES,
  FIN_ACCOUNT_SUBTYPES,
  FIN_ACCOUNT_TYPES,
  FIN_BUDGET_PERIODS,
} from '@domusafe/contracts';
import { hasFeature, type PlanTier } from '@domusafe/plans';
import { useApi } from '@/components/api-context.js';
import { Field } from '@/components/shell/page.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { problemText } from '@/lib/copy.js';
import {
  financeAccountsQuery,
  financeBudgetsQuery,
  financeRecurringQuery,
  financeSavingsGoalsQuery,
  financeTransactionsQuery,
  residentsQuery,
} from '@/lib/queries.js';
import { m } from '@/paraglide/messages.js';

const touchControl =
  'min-h-12 w-full rounded-md border border-input bg-transparent px-3 text-[15px] text-foreground';

type FinanceSection =
  | 'accounts'
  | 'transactions'
  | 'budgets'
  | 'goals'
  | 'recurring'
  | 'splits'
  | 'reports';

function todayLocal(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${String(now.getFullYear())}-${month}-${day}`;
}

function parseSignedMinor(value: string): number | null {
  const trimmed = value.trim().replace(',', '.');
  if (trimmed === '') {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed === 0) {
    return null;
  }
  return Math.round(parsed * 100);
}

function parsePositiveMinor(value: string): number | null {
  const minor = parseSignedMinor(value);
  if (minor === null || minor <= 0) {
    return null;
  }
  return minor;
}

type CurrencyCode = FinAccount['currency'];

function asCurrency(value: string, fallback: CurrencyCode): CurrencyCode {
  const upper = value.trim().toUpperCase();
  return (CURRENCY_CODES as readonly string[]).includes(upper) ? (upper as CurrencyCode) : fallback;
}

function formatMinor(amountMinor: number, currency: string): string {
  return `${(amountMinor / 100).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function accountTypeLabel(type: FinAccountType): string {
  switch (type) {
    case 'asset':
      return m.extraFinanceTypeAsset();
    case 'liability':
      return m.extraFinanceTypeLiability();
    case 'equity':
      return m.extraFinanceTypeEquity();
    case 'income':
      return m.extraFinanceTypeIncome();
    case 'expense':
      return m.extraFinanceTypeExpense();
  }
}

function accountSubtypeLabel(subtype: FinAccountSubtype): string {
  switch (subtype) {
    case 'cash':
      return m.extraFinanceSubtypeCash();
    case 'bank':
      return m.extraFinanceSubtypeBank();
    case 'card':
      return m.extraFinanceSubtypeCard();
    case 'savings':
      return m.extraFinanceSubtypeSavings();
    case 'piggy_bank':
      return m.extraFinanceSubtypePiggyBank();
    case 'loan':
      return m.extraFinanceSubtypeLoan();
    case 'mortgage':
      return m.extraFinanceSubtypeMortgage();
    case 'investment':
      return m.extraFinanceSubtypeInvestment();
    case 'currency_exchange':
      return m.extraFinanceSubtypeCurrencyExchange();
    case 'opening_balance':
      return m.extraFinanceSubtypeOpeningBalance();
    case 'category':
      return m.extraFinanceSubtypeCategory();
  }
}

function budgetPeriodLabel(period: FinBudgetPeriod): string {
  return period === 'monthly' ? m.extraFinancePeriodMonthly() : m.extraFinancePeriodYearly();
}

function sectionLabel(section: FinanceSection): string {
  switch (section) {
    case 'accounts':
      return m.extraFinanceTabAccounts();
    case 'transactions':
      return m.extraFinanceTabTransactions();
    case 'budgets':
      return m.extraFinanceTabBudgets();
    case 'goals':
      return m.extraFinanceTabGoals();
    case 'recurring':
      return m.extraFinanceTabRecurring();
    case 'splits':
      return m.extraFinanceTabSplits();
    case 'reports':
      return m.extraFinanceTabReports();
  }
}

function AccountSelect(props: {
  readonly id: string;
  readonly value: string;
  readonly accounts: readonly FinAccount[];
  readonly onChange: (value: string) => void;
  readonly label: string;
}) {
  return (
    <Field label={props.label} htmlFor={props.id}>
      <Select value={props.value === '' ? undefined : props.value} onValueChange={props.onChange}>
        <SelectTrigger id={props.id} className="min-h-12 w-full text-[15px]">
          <SelectValue placeholder={m.extraFinancePickAccount()} />
        </SelectTrigger>
        <SelectContent>
          {props.accounts.map((account) => (
            <SelectItem key={account.id} value={account.id}>
              {account.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

/**
 * Family ledger under Extra: accounts, movements, budgets, savings, recurring, splits and balances.
 *
 * Preconditions: the caller can read finance; write forms appear only when `canWrite` is true.
 * Postconditions: creates persist in Postgres via the finance routes; Free plans see the locked copy.
 * Data contract: no browser source of truth; amounts are entered as major units and stored as minor.
 *
 * @param props - Account, open family and write capability.
 * @returns The panel.
 */
export function FinancePanel(props: {
  readonly me: Me;
  readonly familyId: string;
  readonly canWrite: boolean;
}) {
  const family = props.me.families.find((item) => item.id === props.familyId);
  const plan: PlanTier = family?.plan ?? 'free';
  const currencyDefault: CurrencyCode = 'EUR';

  if (!hasFeature(plan, 'finance')) {
    return (
      <section className="grid max-w-xl gap-4">
        <div>
          <h2 className="text-[15px] font-medium">{m.extraFinanceTitle()}</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{m.extraFinanceLead()}</p>
        </div>
        <p className="text-[13px] leading-relaxed text-muted-foreground">{m.extraFinanceLocked()}</p>
      </section>
    );
  }

  return (
    <FinanceBody
      familyId={props.familyId}
      canWrite={props.canWrite}
      houseId={props.me.lastHouseId}
      currencyDefault={currencyDefault}
    />
  );
}

function FinanceBody(props: {
  readonly familyId: string;
  readonly canWrite: boolean;
  readonly houseId: string | null;
  readonly currencyDefault: CurrencyCode;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const accounts = useQuery(financeAccountsQuery(api, props.familyId));
  const transactions = useQuery(financeTransactionsQuery(api, props.familyId));
  const budgets = useQuery(financeBudgetsQuery(api, props.familyId));
  const goals = useQuery(financeSavingsGoalsQuery(api, props.familyId));
  const recurring = useQuery(financeRecurringQuery(api, props.familyId));
  const residents = useQuery({
    ...residentsQuery(api, props.familyId, props.houseId ?? ''),
    enabled: props.houseId !== null,
  });

  const [section, setSection] = useState<FinanceSection>('accounts');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [accountName, setAccountName] = useState('');
  const [accountType, setAccountType] = useState<FinAccountType>('asset');
  const [accountSubtype, setAccountSubtype] = useState<FinAccountSubtype>('bank');
  const [accountCurrency, setAccountCurrency] = useState<string>(props.currencyDefault);

  const [txDescription, setTxDescription] = useState('');
  const [txDate, setTxDate] = useState(todayLocal);
  const [txAccount1, setTxAccount1] = useState('');
  const [txAmount1, setTxAmount1] = useState('');
  const [txAccount2, setTxAccount2] = useState('');
  const [txAmount2, setTxAmount2] = useState('');

  const [budgetAccountId, setBudgetAccountId] = useState('');
  const [budgetPeriod, setBudgetPeriod] = useState<FinBudgetPeriod>('monthly');
  const [budgetStartsOn, setBudgetStartsOn] = useState(todayLocal);
  const [budgetAmount, setBudgetAmount] = useState('');
  const [budgetCurrency, setBudgetCurrency] = useState<string>(props.currencyDefault);

  const [goalName, setGoalName] = useState('');
  const [goalAccountId, setGoalAccountId] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [goalTargetDate, setGoalTargetDate] = useState('');

  const [recDescription, setRecDescription] = useState('');
  const [recNextRun, setRecNextRun] = useState(todayLocal);
  const [recAccount1, setRecAccount1] = useState('');
  const [recAmount1, setRecAmount1] = useState('');
  const [recAccount2, setRecAccount2] = useState('');
  const [recAmount2, setRecAmount2] = useState('');

  const [splitTxId, setSplitTxId] = useState('');
  const [splitResident1, setSplitResident1] = useState('');
  const [splitShare1, setSplitShare1] = useState('');
  const [splitResident2, setSplitResident2] = useState('');
  const [splitShare2, setSplitShare2] = useState('');
  const [splitCurrency, setSplitCurrency] = useState<string>(props.currencyDefault);

  const [reportFrom, setReportFrom] = useState(() => {
    const now = new Date();
    return `${String(now.getFullYear())}-01-01`;
  });
  const [reportTo, setReportTo] = useState(todayLocal);
  const [reportRows, setReportRows] = useState<
    | readonly {
        readonly key: string;
        readonly label: string;
        readonly amountMinor: number;
        readonly currency: string;
      }[]
    | null
  >(null);

  async function refresh(): Promise<void> {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['finance-accounts', props.familyId] }),
      queryClient.invalidateQueries({ queryKey: ['finance-transactions', props.familyId] }),
      queryClient.invalidateQueries({ queryKey: ['finance-budgets', props.familyId] }),
      queryClient.invalidateQueries({ queryKey: ['finance-savings-goals', props.familyId] }),
      queryClient.invalidateQueries({ queryKey: ['finance-recurring', props.familyId] }),
    ]);
  }

  async function addAccount(): Promise<void> {
    if (accountName.trim() === '') {
      setError(m.extraFinanceNeedName());
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api.createFinanceAccount(props.familyId, crypto.randomUUID(), {
        name: accountName.trim(),
        type: accountType,
        subtype: accountSubtype,
        currency: asCurrency(accountCurrency, props.currencyDefault),
      });
      setAccountName('');
      await refresh();
    } catch (caught) {
      setError(problemText(caught));
    } finally {
      setPending(false);
    }
  }

  async function addTransaction(): Promise<void> {
    if (txDescription.trim() === '') {
      setError(m.extraFinanceNeedDescription());
      return;
    }
    if (txDate.trim() === '') {
      setError(m.extraFinanceNeedDate());
      return;
    }
    const amount1 = parseSignedMinor(txAmount1);
    const amount2 = parseSignedMinor(txAmount2);
    if (txAccount1 === '' || txAccount2 === '' || amount1 === null || amount2 === null) {
      setError(m.extraFinanceNeedPostings());
      return;
    }
    const accountRows = accounts.data ?? [];
    const currency1: CurrencyCode =
      accountRows.find((row) => row.id === txAccount1)?.currency ?? props.currencyDefault;
    const currency2: CurrencyCode =
      accountRows.find((row) => row.id === txAccount2)?.currency ?? props.currencyDefault;
    setPending(true);
    setError(null);
    try {
      await api.createFinanceTransaction(props.familyId, crypto.randomUUID(), {
        bookedOn: txDate,
        description: txDescription.trim(),
        postings: [
          { accountId: txAccount1, amountMinor: amount1, currency: currency1 },
          { accountId: txAccount2, amountMinor: amount2, currency: currency2 },
        ],
      });
      setTxDescription('');
      setTxAmount1('');
      setTxAmount2('');
      await refresh();
    } catch (caught) {
      setError(problemText(caught));
    } finally {
      setPending(false);
    }
  }

  async function addBudget(): Promise<void> {
    const amountMinor = parsePositiveMinor(budgetAmount);
    if (budgetAccountId === '' || amountMinor === null || budgetStartsOn.trim() === '') {
      setError(m.extraFinanceNeedBudget());
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api.createFinanceBudget(props.familyId, crypto.randomUUID(), {
        accountId: budgetAccountId,
        period: budgetPeriod,
        startsOn: budgetStartsOn,
        amountMinor,
        currency: asCurrency(budgetCurrency, props.currencyDefault),
      });
      setBudgetAmount('');
      await refresh();
    } catch (caught) {
      setError(problemText(caught));
    } finally {
      setPending(false);
    }
  }

  async function addGoal(): Promise<void> {
    const targetMinor = parsePositiveMinor(goalTarget);
    if (goalName.trim() === '' || goalAccountId === '' || targetMinor === null) {
      setError(m.extraFinanceNeedGoal());
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api.createFinanceSavingsGoal(props.familyId, crypto.randomUUID(), {
        accountId: goalAccountId,
        name: goalName.trim(),
        targetMinor,
        targetDate: goalTargetDate.trim() === '' ? null : goalTargetDate.trim(),
      });
      setGoalName('');
      setGoalTarget('');
      setGoalTargetDate('');
      await refresh();
    } catch (caught) {
      setError(problemText(caught));
    } finally {
      setPending(false);
    }
  }

  async function addRecurring(): Promise<void> {
    if (recDescription.trim() === '' || recNextRun.trim() === '') {
      setError(m.extraFinanceNeedRecurring());
      return;
    }
    const amount1 = parseSignedMinor(recAmount1);
    const amount2 = parseSignedMinor(recAmount2);
    if (recAccount1 === '' || recAccount2 === '' || amount1 === null || amount2 === null) {
      setError(m.extraFinanceNeedPostings());
      return;
    }
    const accountRows = accounts.data ?? [];
    const currency1: CurrencyCode =
      accountRows.find((row) => row.id === recAccount1)?.currency ?? props.currencyDefault;
    const currency2: CurrencyCode =
      accountRows.find((row) => row.id === recAccount2)?.currency ?? props.currencyDefault;
    setPending(true);
    setError(null);
    try {
      await api.createFinanceRecurring(props.familyId, crypto.randomUUID(), {
        description: recDescription.trim(),
        rrule: 'FREQ=MONTHLY',
        nextRunOn: recNextRun,
        template: {
          description: recDescription.trim(),
          payee: null,
          tags: [],
          notes: null,
          postings: [
            { accountId: recAccount1, amountMinor: amount1, currency: currency1, memo: null },
            { accountId: recAccount2, amountMinor: amount2, currency: currency2, memo: null },
          ],
        },
      });
      setRecDescription('');
      setRecAmount1('');
      setRecAmount2('');
      await refresh();
    } catch (caught) {
      setError(problemText(caught));
    } finally {
      setPending(false);
    }
  }

  async function saveSplits(): Promise<void> {
    const share1 = parsePositiveMinor(splitShare1);
    const share2 = parsePositiveMinor(splitShare2);
    if (splitTxId === '' || splitResident1 === '' || splitResident2 === '' || share1 === null || share2 === null) {
      setError(m.extraFinanceNeedSplit());
      return;
    }
    setPending(true);
    setError(null);
    try {
      const currency = asCurrency(splitCurrency, props.currencyDefault);
      await api.putFinanceSplits(props.familyId, splitTxId, crypto.randomUUID(), {
        shares: [
          { residentId: splitResident1, shareMinor: share1, currency },
          { residentId: splitResident2, shareMinor: share2, currency },
        ],
      });
      setSplitShare1('');
      setSplitShare2('');
      await refresh();
    } catch (caught) {
      setError(problemText(caught));
    } finally {
      setPending(false);
    }
  }

  async function loadReport(): Promise<void> {
    if (reportFrom.trim() === '' || reportTo.trim() === '') {
      setError(m.extraFinanceNeedDate());
      return;
    }
    setPending(true);
    setError(null);
    try {
      const report = await api.getFinanceReport(props.familyId, 'balances', reportFrom, reportTo);
      setReportRows(report.rows);
    } catch (caught) {
      setError(problemText(caught));
    } finally {
      setPending(false);
    }
  }

  if (accounts.isPending || transactions.isPending) {
    return <p className="text-[13px] text-muted-foreground">{m.loading()}</p>;
  }
  if (accounts.isError || transactions.isError) {
    return (
      <p role="alert" className="text-[13px] text-destructive">
        {problemText(accounts.error ?? transactions.error)}
      </p>
    );
  }

  const accountRows = accounts.data;
  const transactionRows = transactions.data;
  const budgetRows = budgets.data ?? [];
  const goalRows = goals.data ?? [];
  const recurringRows = recurring.data ?? [];
  const residentRows = residents.data ?? [];
  const sections: FinanceSection[] = [
    'accounts',
    'transactions',
    'budgets',
    'goals',
    'recurring',
    'splits',
    'reports',
  ];

  return (
    <section className="grid max-w-xl gap-6">
      <div>
        <h2 className="text-[15px] font-medium">{m.extraFinanceTitle()}</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{m.extraFinanceLead()}</p>
        {props.canWrite ? null : (
          <p className="mt-2 text-[13px] text-muted-foreground">{m.extraFinanceReadOnly()}</p>
        )}
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border" role="tablist">
        {sections.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={item === section}
            className={
              item === section
                ? 'h-12 border-b-2 border-foreground px-3 text-[15px]'
                : 'h-12 px-3 text-[15px] text-muted-foreground'
            }
            onClick={() => setSection(item)}
          >
            {sectionLabel(item)}
          </button>
        ))}
      </div>

      {section === 'accounts' ? (
        <div className="grid gap-4">
          {props.canWrite ? (
            <div className="grid gap-3">
              <h3 className="text-[13px] font-medium">{m.extraFinanceAccountCreate()}</h3>
              <Field label={m.extraFinanceAccountName()} htmlFor="fin-account-name">
                <Input
                  id="fin-account-name"
                  className={touchControl}
                  value={accountName}
                  onChange={(event) => setAccountName(event.target.value)}
                />
              </Field>
              <Field label={m.extraFinanceAccountType()} htmlFor="fin-account-type">
                <Select value={accountType} onValueChange={(value) => setAccountType(value as FinAccountType)}>
                  <SelectTrigger id="fin-account-type" className="min-h-12 w-full text-[15px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FIN_ACCOUNT_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {accountTypeLabel(type)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={m.extraFinanceAccountSubtype()} htmlFor="fin-account-subtype">
                <Select
                  value={accountSubtype}
                  onValueChange={(value) => setAccountSubtype(value as FinAccountSubtype)}
                >
                  <SelectTrigger id="fin-account-subtype" className="min-h-12 w-full text-[15px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FIN_ACCOUNT_SUBTYPES.map((subtype) => (
                      <SelectItem key={subtype} value={subtype}>
                        {accountSubtypeLabel(subtype)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={m.extraFinanceCurrency()} htmlFor="fin-account-currency">
                <Input
                  id="fin-account-currency"
                  className={touchControl}
                  value={accountCurrency}
                  onChange={(event) => setAccountCurrency(event.target.value.toUpperCase())}
                />
              </Field>
              <Button size="emergency" disabled={pending} onClick={() => void addAccount()}>
                {m.extraFinanceAccountSave()}
              </Button>
            </div>
          ) : null}
          <div className="grid gap-2">
            <h3 className="text-[13px] font-medium">{m.extraFinanceAccountsList()}</h3>
            {accountRows.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">{m.extraFinanceAccountsEmpty()}</p>
            ) : (
              <ul className="divide-y divide-border border-y border-border">
                {accountRows.map((account) => (
                  <li key={account.id} className="flex min-h-12 items-center justify-between gap-3 py-2 text-[15px]">
                    <span>{account.name}</span>
                    <span className="text-[13px] text-muted-foreground">
                      {accountTypeLabel(account.type)} · {accountSubtypeLabel(account.subtype)} · {account.currency}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      {section === 'transactions' ? (
        <div className="grid gap-4">
          {props.canWrite ? (
            <div className="grid gap-3">
              <h3 className="text-[13px] font-medium">{m.extraFinanceTxCreate()}</h3>
              <Field label={m.extraFinanceTxDescription()} htmlFor="fin-tx-description">
                <Input
                  id="fin-tx-description"
                  className={touchControl}
                  value={txDescription}
                  onChange={(event) => setTxDescription(event.target.value)}
                />
              </Field>
              <Field label={m.extraFinanceTxDate()} htmlFor="fin-tx-date">
                <Input
                  id="fin-tx-date"
                  type="date"
                  className={touchControl}
                  value={txDate}
                  onChange={(event) => setTxDate(event.target.value)}
                />
              </Field>
              <AccountSelect
                id="fin-tx-account-1"
                label={m.extraFinanceTxAccount1()}
                value={txAccount1}
                accounts={accountRows}
                onChange={setTxAccount1}
              />
              <Field label={m.extraFinanceTxAmount1()} htmlFor="fin-tx-amount-1">
                <Input
                  id="fin-tx-amount-1"
                  className={touchControl}
                  value={txAmount1}
                  onChange={(event) => setTxAmount1(event.target.value)}
                  placeholder={m.extraFinanceAmountHint()}
                />
              </Field>
              <AccountSelect
                id="fin-tx-account-2"
                label={m.extraFinanceTxAccount2()}
                value={txAccount2}
                accounts={accountRows}
                onChange={setTxAccount2}
              />
              <Field label={m.extraFinanceTxAmount2()} htmlFor="fin-tx-amount-2">
                <Input
                  id="fin-tx-amount-2"
                  className={touchControl}
                  value={txAmount2}
                  onChange={(event) => setTxAmount2(event.target.value)}
                  placeholder={m.extraFinanceAmountHint()}
                />
              </Field>
              <Button size="emergency" disabled={pending} onClick={() => void addTransaction()}>
                {m.extraFinanceTxSave()}
              </Button>
            </div>
          ) : null}
          <div className="grid gap-2">
            <h3 className="text-[13px] font-medium">{m.extraFinanceTxList()}</h3>
            {transactionRows.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">{m.extraFinanceTxEmpty()}</p>
            ) : (
              <ul className="divide-y divide-border border-y border-border">
                {transactionRows.map((tx) => (
                  <li key={tx.id} className="grid min-h-12 gap-1 py-2 text-[15px]">
                    <span>
                      {tx.bookedOn} · {tx.description}
                    </span>
                    <span className="text-[13px] text-muted-foreground">
                      {tx.postings
                        .map((posting) => {
                          const name =
                            accountRows.find((account) => account.id === posting.accountId)?.name ??
                            posting.accountId;
                          return `${name} ${formatMinor(posting.amountMinor, posting.currency)}`;
                        })
                        .join(' · ')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      {section === 'budgets' ? (
        <div className="grid gap-4">
          {props.canWrite ? (
            <div className="grid gap-3">
              <h3 className="text-[13px] font-medium">{m.extraFinanceBudgetCreate()}</h3>
              <AccountSelect
                id="fin-budget-account"
                label={m.extraFinanceBudgetAccount()}
                value={budgetAccountId}
                accounts={accountRows}
                onChange={setBudgetAccountId}
              />
              <Field label={m.extraFinanceBudgetPeriod()} htmlFor="fin-budget-period">
                <Select
                  value={budgetPeriod}
                  onValueChange={(value) => setBudgetPeriod(value as FinBudgetPeriod)}
                >
                  <SelectTrigger id="fin-budget-period" className="min-h-12 w-full text-[15px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FIN_BUDGET_PERIODS.map((period) => (
                      <SelectItem key={period} value={period}>
                        {budgetPeriodLabel(period)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={m.extraFinanceBudgetStartsOn()} htmlFor="fin-budget-starts">
                <Input
                  id="fin-budget-starts"
                  type="date"
                  className={touchControl}
                  value={budgetStartsOn}
                  onChange={(event) => setBudgetStartsOn(event.target.value)}
                />
              </Field>
              <Field label={m.extraFinanceBudgetAmount()} htmlFor="fin-budget-amount">
                <Input
                  id="fin-budget-amount"
                  className={touchControl}
                  value={budgetAmount}
                  onChange={(event) => setBudgetAmount(event.target.value)}
                  placeholder={m.extraFinanceAmountHintPositive()}
                />
              </Field>
              <Field label={m.extraFinanceCurrency()} htmlFor="fin-budget-currency">
                <Input
                  id="fin-budget-currency"
                  className={touchControl}
                  value={budgetCurrency}
                  onChange={(event) => setBudgetCurrency(event.target.value.toUpperCase())}
                />
              </Field>
              <Button size="emergency" disabled={pending} onClick={() => void addBudget()}>
                {m.extraFinanceBudgetSave()}
              </Button>
            </div>
          ) : null}
          <div className="grid gap-2">
            <h3 className="text-[13px] font-medium">{m.extraFinanceBudgetList()}</h3>
            {budgets.isPending ? <p className="text-[13px] text-muted-foreground">{m.loading()}</p> : null}
            {!budgets.isPending && budgetRows.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">{m.extraFinanceBudgetEmpty()}</p>
            ) : null}
            <ul className="divide-y divide-border border-y border-border">
              {budgetRows.map((budget) => (
                <li key={budget.id} className="flex min-h-12 items-center justify-between gap-3 py-2 text-[15px]">
                  <span>
                    {accountRows.find((account) => account.id === budget.accountId)?.name ?? budget.accountId}
                  </span>
                  <span className="text-[13px] text-muted-foreground">
                    {budgetPeriodLabel(budget.period)} · {formatMinor(budget.amountMinor, budget.currency)} ·{' '}
                    {m.extraFinanceBudgetSpent({ spent: formatMinor(budget.spentMinor, budget.currency) })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {section === 'goals' ? (
        <div className="grid gap-4">
          {props.canWrite ? (
            <div className="grid gap-3">
              <h3 className="text-[13px] font-medium">{m.extraFinanceGoalCreate()}</h3>
              <Field label={m.extraFinanceGoalName()} htmlFor="fin-goal-name">
                <Input
                  id="fin-goal-name"
                  className={touchControl}
                  value={goalName}
                  onChange={(event) => setGoalName(event.target.value)}
                />
              </Field>
              <AccountSelect
                id="fin-goal-account"
                label={m.extraFinanceGoalAccount()}
                value={goalAccountId}
                accounts={accountRows}
                onChange={setGoalAccountId}
              />
              <Field label={m.extraFinanceGoalTarget()} htmlFor="fin-goal-target">
                <Input
                  id="fin-goal-target"
                  className={touchControl}
                  value={goalTarget}
                  onChange={(event) => setGoalTarget(event.target.value)}
                  placeholder={m.extraFinanceAmountHintPositive()}
                />
              </Field>
              <Field label={m.extraFinanceGoalTargetDate()} htmlFor="fin-goal-date">
                <Input
                  id="fin-goal-date"
                  type="date"
                  className={touchControl}
                  value={goalTargetDate}
                  onChange={(event) => setGoalTargetDate(event.target.value)}
                />
              </Field>
              <Button size="emergency" disabled={pending} onClick={() => void addGoal()}>
                {m.extraFinanceGoalSave()}
              </Button>
            </div>
          ) : null}
          <div className="grid gap-2">
            <h3 className="text-[13px] font-medium">{m.extraFinanceGoalList()}</h3>
            {goals.isPending ? <p className="text-[13px] text-muted-foreground">{m.loading()}</p> : null}
            {!goals.isPending && goalRows.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">{m.extraFinanceGoalEmpty()}</p>
            ) : null}
            <ul className="divide-y divide-border border-y border-border">
              {goalRows.map((goal) => (
                <li key={goal.id} className="flex min-h-12 items-center justify-between gap-3 py-2 text-[15px]">
                  <span>{goal.name}</span>
                  <span className="text-[13px] text-muted-foreground">
                    {formatMinor(goal.balanceMinor, props.currencyDefault)} /{' '}
                    {formatMinor(goal.targetMinor, props.currencyDefault)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {section === 'recurring' ? (
        <div className="grid gap-4">
          {props.canWrite ? (
            <div className="grid gap-3">
              <h3 className="text-[13px] font-medium">{m.extraFinanceRecurringCreate()}</h3>
              <p className="text-[13px] text-muted-foreground">{m.extraFinanceRecurringMonthly()}</p>
              <Field label={m.extraFinanceRecurringDescription()} htmlFor="fin-rec-description">
                <Input
                  id="fin-rec-description"
                  className={touchControl}
                  value={recDescription}
                  onChange={(event) => setRecDescription(event.target.value)}
                />
              </Field>
              <Field label={m.extraFinanceRecurringNextRun()} htmlFor="fin-rec-next">
                <Input
                  id="fin-rec-next"
                  type="date"
                  className={touchControl}
                  value={recNextRun}
                  onChange={(event) => setRecNextRun(event.target.value)}
                />
              </Field>
              <AccountSelect
                id="fin-rec-account-1"
                label={m.extraFinanceTxAccount1()}
                value={recAccount1}
                accounts={accountRows}
                onChange={setRecAccount1}
              />
              <Field label={m.extraFinanceTxAmount1()} htmlFor="fin-rec-amount-1">
                <Input
                  id="fin-rec-amount-1"
                  className={touchControl}
                  value={recAmount1}
                  onChange={(event) => setRecAmount1(event.target.value)}
                  placeholder={m.extraFinanceAmountHint()}
                />
              </Field>
              <AccountSelect
                id="fin-rec-account-2"
                label={m.extraFinanceTxAccount2()}
                value={recAccount2}
                accounts={accountRows}
                onChange={setRecAccount2}
              />
              <Field label={m.extraFinanceTxAmount2()} htmlFor="fin-rec-amount-2">
                <Input
                  id="fin-rec-amount-2"
                  className={touchControl}
                  value={recAmount2}
                  onChange={(event) => setRecAmount2(event.target.value)}
                  placeholder={m.extraFinanceAmountHint()}
                />
              </Field>
              <Button size="emergency" disabled={pending} onClick={() => void addRecurring()}>
                {m.extraFinanceRecurringSave()}
              </Button>
            </div>
          ) : null}
          <div className="grid gap-2">
            <h3 className="text-[13px] font-medium">{m.extraFinanceRecurringList()}</h3>
            {recurring.isPending ? <p className="text-[13px] text-muted-foreground">{m.loading()}</p> : null}
            {!recurring.isPending && recurringRows.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">{m.extraFinanceRecurringEmpty()}</p>
            ) : null}
            <ul className="divide-y divide-border border-y border-border">
              {recurringRows.map((row) => (
                <li key={row.id} className="flex min-h-12 items-center justify-between gap-3 py-2 text-[15px]">
                  <span>{row.description}</span>
                  <span className="text-[13px] text-muted-foreground">
                    {m.extraFinanceRecurringNext({ date: row.nextRunOn })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {section === 'splits' ? (
        <div className="grid gap-4">
          {props.canWrite ? (
            <div className="grid gap-3">
              <h3 className="text-[13px] font-medium">{m.extraFinanceSplitCreate()}</h3>
              <Field label={m.extraFinanceSplitTransaction()} htmlFor="fin-split-tx">
                <Select value={splitTxId === '' ? undefined : splitTxId} onValueChange={setSplitTxId}>
                  <SelectTrigger id="fin-split-tx" className="min-h-12 w-full text-[15px]">
                    <SelectValue placeholder={m.extraFinancePickTransaction()} />
                  </SelectTrigger>
                  <SelectContent>
                    {transactionRows.map((tx: FinTransaction) => (
                      <SelectItem key={tx.id} value={tx.id}>
                        {tx.bookedOn} · {tx.description}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={m.extraFinanceSplitResident1()} htmlFor="fin-split-resident-1">
                <Select
                  value={splitResident1 === '' ? undefined : splitResident1}
                  onValueChange={setSplitResident1}
                >
                  <SelectTrigger id="fin-split-resident-1" className="min-h-12 w-full text-[15px]">
                    <SelectValue placeholder={m.extraFinancePickResident()} />
                  </SelectTrigger>
                  <SelectContent>
                    {residentRows.map((resident) => (
                      <SelectItem key={resident.id} value={resident.id}>
                        {resident.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={m.extraFinanceSplitShare1()} htmlFor="fin-split-share-1">
                <Input
                  id="fin-split-share-1"
                  className={touchControl}
                  value={splitShare1}
                  onChange={(event) => setSplitShare1(event.target.value)}
                  placeholder={m.extraFinanceAmountHintPositive()}
                />
              </Field>
              <Field label={m.extraFinanceSplitResident2()} htmlFor="fin-split-resident-2">
                <Select
                  value={splitResident2 === '' ? undefined : splitResident2}
                  onValueChange={setSplitResident2}
                >
                  <SelectTrigger id="fin-split-resident-2" className="min-h-12 w-full text-[15px]">
                    <SelectValue placeholder={m.extraFinancePickResident()} />
                  </SelectTrigger>
                  <SelectContent>
                    {residentRows.map((resident) => (
                      <SelectItem key={resident.id} value={resident.id}>
                        {resident.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={m.extraFinanceSplitShare2()} htmlFor="fin-split-share-2">
                <Input
                  id="fin-split-share-2"
                  className={touchControl}
                  value={splitShare2}
                  onChange={(event) => setSplitShare2(event.target.value)}
                  placeholder={m.extraFinanceAmountHintPositive()}
                />
              </Field>
              <Field label={m.extraFinanceCurrency()} htmlFor="fin-split-currency">
                <Input
                  id="fin-split-currency"
                  className={touchControl}
                  value={splitCurrency}
                  onChange={(event) => setSplitCurrency(event.target.value.toUpperCase())}
                />
              </Field>
              <Button size="emergency" disabled={pending} onClick={() => void saveSplits()}>
                {m.extraFinanceSplitSave()}
              </Button>
            </div>
          ) : null}
          {residentRows.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">{m.extraFinanceSplitNeedResidents()}</p>
          ) : null}
        </div>
      ) : null}

      {section === 'reports' ? (
        <div className="grid gap-4">
          <h3 className="text-[13px] font-medium">{m.extraFinanceReportBalances()}</h3>
          <Field label={m.extraFinanceReportFrom()} htmlFor="fin-report-from">
            <Input
              id="fin-report-from"
              type="date"
              className={touchControl}
              value={reportFrom}
              onChange={(event) => setReportFrom(event.target.value)}
            />
          </Field>
          <Field label={m.extraFinanceReportTo()} htmlFor="fin-report-to">
            <Input
              id="fin-report-to"
              type="date"
              className={touchControl}
              value={reportTo}
              onChange={(event) => setReportTo(event.target.value)}
            />
          </Field>
          <Button size="emergency" disabled={pending} onClick={() => void loadReport()}>
            {m.extraFinanceReportLoad()}
          </Button>
          {reportRows === null ? null : reportRows.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">{m.extraFinanceReportEmpty()}</p>
          ) : (
            <ul className="divide-y divide-border border-y border-border">
              {reportRows.map((row) => (
                <li key={row.key} className="flex min-h-12 items-center justify-between gap-3 py-2 text-[15px]">
                  <span>{row.label}</span>
                  <span className="text-[13px] text-muted-foreground">
                    {formatMinor(row.amountMinor, row.currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {error === null ? null : (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
