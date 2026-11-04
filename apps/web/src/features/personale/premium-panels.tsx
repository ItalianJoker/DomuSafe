import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { hasFeature, type PlanTier } from '@domusafe/plans';
import { useApi } from '@/components/api-context.js';
import { Field } from '@/components/shell/page.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { problemText } from '@/lib/copy.js';
import { bankAccountsQuery, residentsQuery, taxQuery } from '@/lib/queries.js';
import { m } from '@/paraglide/messages.js';
import { TAX_STATUS_OPTIONS, taxLabel, taxStatusLabel } from './model.js';

/**
 * Annual tax checklist. Hidden behind Premium, including the thirty-day trial.
 *
 * Preconditions: the plan is the effective plan of the family.
 * Postconditions: preparing a year creates the standard items once.
 * Data contract: labels are full words; the stored key stays stable.
 *
 * @param props - Family, house, plan and whether the person may edit.
 * @returns The tax tab.
 */
export function TaxPanel(props: {
  readonly familyId: string;
  readonly houseId: string;
  readonly plan: PlanTier;
  readonly canWrite: boolean;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const people = useQuery(residentsQuery(api, props.familyId, props.houseId));
  const resident = people.data?.[0];
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const yearNumber = Number(year);
  const checklist = useQuery({
    ...taxQuery(api, props.familyId, resident?.id ?? '', yearNumber),
    enabled: resident !== undefined && hasFeature(props.plan, 'taxes') && Number.isInteger(yearNumber),
  });
  const [error, setError] = useState<string | null>(null);

  if (!hasFeature(props.plan, 'taxes')) {
    return <p className="max-w-xl text-[13px] text-muted-foreground">{m.personalePremium()}</p>;
  }
  if (resident === undefined) {
    return <p className="text-[13px] text-muted-foreground">{m.personaleNone()}</p>;
  }
  const person = resident;

  async function prepare(): Promise<void> {
    setError(null);
    try {
      await api.generateTax(props.familyId, { residentId: person.id, year: yearNumber }, crypto.randomUUID());
      await queryClient.invalidateQueries({
        queryKey: taxQuery(api, props.familyId, person.id, yearNumber).queryKey,
      });
    } catch (caught) {
      setError(problemText(caught));
    }
  }

  async function setStatus(
    itemId: string,
    version: number,
    status: (typeof TAX_STATUS_OPTIONS)[number],
  ): Promise<void> {
    setError(null);
    try {
      await api.updateTaxItem(props.familyId, itemId, version, { status });
      await queryClient.invalidateQueries({
        queryKey: taxQuery(api, props.familyId, person.id, yearNumber).queryKey,
      });
    } catch (caught) {
      setError(problemText(caught));
    }
  }

  return (
    <div className="grid max-w-xl gap-4">
      <Field label={m.personaleTaxYear()} htmlFor="tax-year">
        <Input
          id="tax-year"
          inputMode="numeric"
          value={year}
          onChange={(event) => setYear(event.target.value)}
        />
      </Field>
      {props.canWrite && !resident.planLocked ? (
        <Button type="button" onClick={() => void prepare()}>
          {m.personaleTaxPrepare()}
        </Button>
      ) : null}
      {(checklist.data?.items.length ?? 0) === 0 ? (
        <p className="text-[13px] text-muted-foreground">{m.personaleTaxEmpty()}</p>
      ) : null}
      {(checklist.data?.items ?? []).map((item) => (
        <div key={item.id} className="grid gap-2 border-t border-border pt-3">
          <p className="text-[13px] font-medium">{taxLabel(item.itemKey)}</p>
          <Select
            value={item.status}
            disabled={!props.canWrite || resident.planLocked}
            onValueChange={(value) => {
              const status = TAX_STATUS_OPTIONS.find((option) => option === value);
              if (status !== undefined) {
                void setStatus(item.id, item.version, status);
              }
            }}
          >
            <SelectTrigger aria-label={taxLabel(item.itemKey)}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TAX_STATUS_OPTIONS.map((status) => (
                <SelectItem key={status} value={status}>
                  {taxStatusLabel(status)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}
      {error === null ? null : <p className="text-[13px] text-destructive">{error}</p>}
    </div>
  );
}

/**
 * Personal bank accounts as metadata. The full number is not collected.
 *
 * Preconditions: the plan is the effective plan, Premium or the trial.
 * Postconditions: only the institution, a label and the last digits are stored.
 * Data contract: the hint is two to eight digits.
 *
 * @param props - Family, house, plan and whether the person may edit.
 * @returns The accounts tab.
 */
export function AccountsPanel(props: {
  readonly familyId: string;
  readonly houseId: string;
  readonly plan: PlanTier;
  readonly canWrite: boolean;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const people = useQuery(residentsQuery(api, props.familyId, props.houseId));
  const resident = people.data?.[0];
  const accounts = useQuery({
    ...bankAccountsQuery(api, props.familyId, resident?.id ?? ''),
    enabled: resident !== undefined && hasFeature(props.plan, 'vault_personal'),
  });
  const [institution, setInstitution] = useState('');
  const [label, setLabel] = useState('');
  const [hint, setHint] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!hasFeature(props.plan, 'vault_personal')) {
    return <p className="max-w-xl text-[13px] text-muted-foreground">{m.personalePremium()}</p>;
  }
  if (resident === undefined) {
    return <p className="text-[13px] text-muted-foreground">{m.personaleNone()}</p>;
  }
  const person = resident;

  async function add(): Promise<void> {
    if (institution.trim() === '' || label.trim() === '') {
      setError(m.fieldRequired());
      return;
    }
    if (hint.trim() !== '' && !/^\d{2,8}$/.test(hint.trim())) {
      setError(m.personaleBankHintHelp());
      return;
    }
    setError(null);
    try {
      await api.createBankAccount(
        props.familyId,
        person.id,
        {
          institution: institution.trim(),
          label: label.trim(),
          ...(hint.trim() === '' ? {} : { referenceHint: hint.trim() }),
        },
        crypto.randomUUID(),
      );
      setInstitution('');
      setLabel('');
      setHint('');
      await queryClient.invalidateQueries({
        queryKey: bankAccountsQuery(api, props.familyId, person.id).queryKey,
      });
    } catch (caught) {
      setError(problemText(caught));
    }
  }

  return (
    <div className="grid max-w-xl gap-4">
      <p className="text-[13px] text-muted-foreground">{m.personaleBankHintHelp()}</p>
      {(accounts.data ?? []).map((account) => (
        <p key={account.id} className="text-[13px]">
          {account.institution} · {account.label}
          {account.referenceHint === null ? '' : ` · ${account.referenceHint}`}
        </p>
      ))}
      {props.canWrite && !resident.planLocked ? (
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
        >
          <Field label={m.personaleBankInstitution()} htmlFor="bank-institution">
            <Input
              id="bank-institution"
              value={institution}
              onChange={(event) => setInstitution(event.target.value)}
            />
          </Field>
          <Field label={m.personaleBankLabel()} htmlFor="bank-label">
            <Input id="bank-label" value={label} onChange={(event) => setLabel(event.target.value)} />
          </Field>
          <Field label={m.personaleBankHint()} htmlFor="bank-hint" hint={m.personaleBankHintHelp()}>
            <Input id="bank-hint" value={hint} onChange={(event) => setHint(event.target.value)} />
          </Field>
          {error === null ? null : <p className="text-[13px] text-destructive">{error}</p>}
          <Button type="submit">{m.personaleAdd()}</Button>
        </form>
      ) : null}
    </div>
  );
}
