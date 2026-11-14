import { useQuery, useQueryClient } from '@tanstack/react-query';
import { lazy, Suspense, useEffect, useState, type SubmitEvent } from 'react';
import type { Utility, UtilityBillExtracted } from '@domusafe/contracts';
import { useApi } from '@/components/api-context.js';
import { Field } from '@/components/shell/page.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Textarea } from '@/components/ui/textarea.js';
import { problemText } from '@/lib/copy.js';
import { utilitiesQuery } from '@/lib/queries.js';
import { m } from '@/paraglide/messages.js';
import { SHOWN_UTILITIES, uuidv7, type ShownUtility } from './model.js';

const BillAssistPanel = lazy(async () => {
  const module = await import('./bill-assist-panel.js');
  return { default: module.BillAssistPanel };
});

function utilityLabel(kind: ShownUtility): string {
  switch (kind) {
    case 'electricity':
      return m.casaPower();
    case 'gas':
      return m.casaShutoffGas();
    case 'internet':
      return m.casaInternet();
    case 'water':
      return m.casaWater();
  }
}

function blank(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Family utilities of the open house: power, gas, internet and water.
 *
 * Preconditions: the caller can read utilities. The Free plan includes them.
 * Postconditions: saves send the loaded version in `If-Match`.
 * Data contract: payment secrets are not collected on this screen; bill OCR loads lazily.
 *
 * @param props - House and whether the person may edit.
 * @returns The utilities section.
 */
export function UtilitiesPanel(props: {
  readonly familyId: string;
  readonly houseId: string;
  readonly canWrite: boolean;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const query = useQuery(utilitiesQuery(api, props.familyId, props.houseId));

  async function refresh(): Promise<void> {
    await queryClient.invalidateQueries({
      queryKey: utilitiesQuery(api, props.familyId, props.houseId).queryKey,
    });
  }

  return (
    <div className="grid max-w-xl gap-8">
      {!props.canWrite ? <p className="text-[13px] text-muted-foreground">{m.casaReadOnly()}</p> : null}
      {query.isPending ? <p className="text-[13px] text-muted-foreground">{m.loading()}</p> : null}
      {query.isError ? (
        <p role="alert" className="text-[13px] text-destructive">
          {problemText(query.error)}
        </p>
      ) : null}
      {query.data === undefined
        ? null
        : SHOWN_UTILITIES.map((kind) => (
            <UtilityCard
              key={kind}
              kind={kind}
              familyId={props.familyId}
              houseId={props.houseId}
              row={query.data.find((item) => item.kind === kind)}
              readOnly={!props.canWrite}
              onSave={async (input) => {
                const row = query.data.find((item) => item.kind === kind);
                const saved =
                  row === undefined
                    ? await api.createUtility(
                        props.familyId,
                        props.houseId,
                        {
                          id: uuidv7(),
                          kind,
                          providerName: input.providerName,
                          autopay: false,
                          ...input.rest,
                        },
                        crypto.randomUUID(),
                      )
                    : await api.updateUtility(props.familyId, props.houseId, row.id, row.version, {
                        providerName: input.providerName,
                        ...input.rest,
                      });
                await refresh();
                return saved;
              }}
            />
          ))}
    </div>
  );
}

function UtilityCard(props: {
  readonly kind: ShownUtility;
  readonly familyId: string;
  readonly houseId: string;
  readonly row: Utility | undefined;
  readonly readOnly: boolean;
  readonly onSave: (input: {
    providerName: string;
    rest: {
      customerCode: string | null;
      supplyPointCode: string | null;
      contractCode?: string | null;
      renewalDate: string | null;
      notes: string | null;
      templateId?: string | null;
      estimatedCost?: { amountMinor: number; currency: 'EUR' } | null;
    };
  }) => Promise<Utility>;
}) {
  const api = useApi();
  const [provider, setProvider] = useState(props.row?.providerName ?? '');
  const [customer, setCustomer] = useState(props.row?.customerCode ?? '');
  const [supply, setSupply] = useState(props.row?.supplyPointCode ?? '');
  const [renewal, setRenewal] = useState(props.row?.renewalDate ?? '');
  const [notes, setNotes] = useState(props.row?.notes ?? '');
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assistOpen, setAssistOpen] = useState(false);
  useEffect(() => {
    setProvider(props.row?.providerName ?? '');
    setCustomer(props.row?.customerCode ?? '');
    setSupply(props.row?.supplyPointCode ?? '');
    setRenewal(props.row?.renewalDate ?? '');
    setNotes(props.row?.notes ?? '');
  }, [
    props.row?.id,
    props.row?.version,
    props.row?.providerName,
    props.row?.customerCode,
    props.row?.supplyPointCode,
    props.row?.renewalDate,
    props.row?.notes,
  ]);

  async function submit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (provider.trim() === '') {
      setError(m.fieldRequired());
      return;
    }
    setPending(true);
    setSaved(false);
    setError(null);
    try {
      await props.onSave({
        providerName: provider.trim(),
        rest: {
          customerCode: blank(customer),
          supplyPointCode: blank(supply),
          renewalDate: renewal === '' ? null : renewal,
          notes: blank(notes),
        },
      });
      setSaved(true);
    } catch (caught) {
      setError(problemText(caught));
    } finally {
      setPending(false);
    }
  }

  async function applyExtracted(extracted: UtilityBillExtracted, templateId: string | null): Promise<void> {
    if (extracted.providerName !== undefined) {
      setProvider(extracted.providerName);
    }
    if (extracted.customerCode !== undefined) {
      setCustomer(extracted.customerCode);
    }
    if (extracted.supplyPointCode !== undefined) {
      setSupply(extracted.supplyPointCode);
    }
    if (extracted.dueDate !== undefined) {
      setRenewal(extracted.dueDate);
    }
    const extractedProvider = extracted.providerName?.trim();
    const typedProvider = provider.trim();
    const providerName =
      extractedProvider !== undefined && extractedProvider !== ''
        ? extractedProvider
        : typedProvider !== ''
          ? typedProvider
          : (props.row?.providerName ?? utilityLabel(props.kind));
    const saved = await props.onSave({
      providerName,
      rest: {
        customerCode: extracted.customerCode ?? blank(customer),
        supplyPointCode: extracted.supplyPointCode ?? blank(supply),
        contractCode: extracted.contractCode ?? null,
        renewalDate: extracted.dueDate ?? (renewal === '' ? null : renewal),
        notes: blank(notes),
        templateId,
        ...(extracted.amountMinor === undefined
          ? {}
          : { estimatedCost: { amountMinor: extracted.amountMinor, currency: 'EUR' as const } }),
      },
    });
    await api.createUtilityBill(
      props.familyId,
      props.houseId,
      saved.id,
      {
        id: uuidv7(),
        dueDate: extracted.dueDate ?? null,
        amount:
          extracted.amountMinor === undefined || extracted.currency === undefined
            ? null
            : { amountMinor: extracted.amountMinor, currency: extracted.currency },
        extracted,
      },
      crypto.randomUUID(),
    );
    setSaved(true);
    setAssistOpen(false);
  }

  return (
    <section>
      <h2 className="mb-3 text-[13px] font-medium">{utilityLabel(props.kind)}</h2>
      {props.readOnly ? (
        props.row === undefined ? (
          <p className="text-[13px] text-muted-foreground">{m.casaEmpty()}</p>
        ) : (
          <p className="text-[13px]">
            {props.row.providerName}
            {props.row.customerCode === null ? '' : ` · ${props.row.customerCode}`}
          </p>
        )
      ) : (
        <form className="grid gap-3" onSubmit={(event) => void submit(event)}>
          <Field htmlFor={`utility-${props.kind}-provider`} label={m.casaProvider()}>
            <Input
              id={`utility-${props.kind}-provider`}
              value={provider}
              onChange={(event) => setProvider(event.target.value)}
            />
          </Field>
          <Field htmlFor={`utility-${props.kind}-customer`} label={m.casaCustomerCode()}>
            <Input
              id={`utility-${props.kind}-customer`}
              value={customer}
              onChange={(event) => setCustomer(event.target.value)}
            />
          </Field>
          <Field htmlFor={`utility-${props.kind}-supply`} label={m.casaSupplyPoint()}>
            <Input
              id={`utility-${props.kind}-supply`}
              value={supply}
              onChange={(event) => setSupply(event.target.value)}
            />
          </Field>
          <Field htmlFor={`utility-${props.kind}-renewal`} label={m.casaRenewal()}>
            <Input
              id={`utility-${props.kind}-renewal`}
              type="date"
              value={renewal}
              onChange={(event) => setRenewal(event.target.value)}
            />
          </Field>
          <Field htmlFor={`utility-${props.kind}-notes`} label={m.casaNotes()}>
            <Textarea
              id={`utility-${props.kind}-notes`}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={pending}>
              {m.save()}
            </Button>
            <Button type="button" variant="outline" onClick={() => setAssistOpen((open) => !open)}>
              {assistOpen ? m.casaBillCloseAssist() : m.casaBillOpenAssist()}
            </Button>
            {error !== null ? (
              <p role="alert" className="text-[12px] text-destructive">
                {error}
              </p>
            ) : null}
            {saved && error === null ? (
              <p className="text-[12px] text-muted-foreground">{m.saved()}</p>
            ) : null}
          </div>
          {assistOpen ? (
            <Suspense fallback={<p className="text-[13px] text-muted-foreground">{m.loading()}</p>}>
              <BillAssistPanel
                familyId={props.familyId}
                kind={props.kind}
                onApply={async ({ extracted, template }) => {
                  await applyExtracted(extracted, template?.id ?? extracted.templateId ?? null);
                }}
              />
            </Suspense>
          ) : null}
        </form>
      )}
    </section>
  );
}
