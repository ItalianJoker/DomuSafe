import { useState } from 'react';
import {
  billsPayloadSchema,
  creditProtectionPayloadSchema,
  digitalLegacyPayloadSchema,
  familyAccountPayloadSchema,
  insurancePayloadSchema,
  mortgagePayloadSchema,
  type FamilyVaultSection,
  type VaultPayload,
} from '@domusafe/contracts';
import { Field, FieldNote } from '@/components/shell/page.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { Textarea } from '@/components/ui/textarea.js';
import { m } from '@/paraglide/messages.js';
import type { OpenDocument } from './crypto-flow.js';
import {
  BANK_RELATIONSHIPS,
  relationshipLabel,
  sectionLabel,
  vaultProblemText,
  vaultSummary,
} from './model.js';

/**
 * Manual editor for one vault section.
 *
 * Preconditions: the vault is open. Plaintext exists only in this component.
 * Postconditions: save hands a validated payload to the caller, which encrypts it before the request.
 *
 * @param props - Section, decrypted documents and save/remove handlers.
 * @returns The list and the form.
 */
export function SectionEditor(props: {
  readonly section: FamilyVaultSection;
  readonly documents: readonly OpenDocument[];
  readonly busy: boolean;
  readonly error: string | null;
  readonly onSave: (
    payload: VaultPayload,
    existing?: { readonly id: string; readonly version: number },
  ) => void;
  readonly onRemove: (id: string, version: number) => void;
}) {
  const [editing, setEditing] = useState<OpenDocument | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  return (
    <div className="grid max-w-xl gap-4">
      {props.documents.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">{m.vaultEmpty()}</p>
      ) : null}
      {props.documents.map((document) => (
        <article key={document.id} className="grid gap-2 border-t border-border pt-3">
          <p className="text-[13px] font-medium">
            {document.payload === null ? m.vaultUnreadable() : vaultSummary(props.section, document.payload)}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={props.busy || document.payload === null}
              onClick={() => setEditing(document)}
            >
              {m.vaultEdit()}
            </Button>
            {confirmId === document.id ? (
              <Button
                type="button"
                variant="destructive"
                disabled={props.busy}
                onClick={() => props.onRemove(document.id, document.version)}
              >
                {m.vaultDeleteConfirm()}
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                disabled={props.busy}
                onClick={() => setConfirmId(document.id)}
              >
                {m.vaultDelete()}
              </Button>
            )}
          </div>
        </article>
      ))}
      <h2 className="text-[13px] font-medium">{sectionLabel(props.section)}</h2>
      <DocumentForm
        key={editing?.id ?? 'new'}
        section={props.section}
        payload={editing?.payload ?? null}
        busy={props.busy}
        error={props.error}
        {...(editing === null ? {} : { onCancel: () => setEditing(null) })}
        onSubmit={(payload) => {
          if (editing === null) {
            props.onSave(payload);
            return;
          }
          props.onSave(payload, { id: editing.id, version: editing.version });
        }}
      />
    </div>
  );
}

function textValue(value: string | undefined): string {
  return value ?? '';
}

function DocumentForm(props: {
  readonly section: FamilyVaultSection;
  readonly payload: VaultPayload | null;
  readonly busy: boolean;
  readonly error: string | null;
  readonly onCancel?: () => void;
  readonly onSubmit: (payload: VaultPayload) => void;
}) {
  const initial = props.payload;
  const [institution, setInstitution] = useState(
    initial !== null && props.section === 'family_accounts'
      ? familyAccountPayloadSchema.parse(initial).institution
      : '',
  );
  const [relationship, setRelationship] = useState<'current_account' | 'savings' | 'investment' | 'other'>(
    initial !== null && props.section === 'family_accounts'
      ? familyAccountPayloadSchema.parse(initial).relationship
      : 'current_account',
  );
  const [holder, setHolder] = useState(
    initial !== null && props.section === 'family_accounts'
      ? familyAccountPayloadSchema.parse(initial).holder
      : '',
  );
  const [branch, setBranch] = useState(
    initial !== null && props.section === 'family_accounts'
      ? textValue(familyAccountPayloadSchema.parse(initial).branch)
      : '',
  );
  const [referenceHint, setReferenceHint] = useState(
    initial !== null && props.section === 'family_accounts'
      ? textValue(familyAccountPayloadSchema.parse(initial).referenceHint)
      : '',
  );
  const [lender, setLender] = useState(
    initial !== null && props.section === 'mortgages' ? mortgagePayloadSchema.parse(initial).lender : '',
  );
  const [property, setProperty] = useState(
    initial !== null && props.section === 'mortgages' ? mortgagePayloadSchema.parse(initial).property : '',
  );
  const [provider, setProvider] = useState(
    initial !== null && props.section === 'credit_protection'
      ? creditProtectionPayloadSchema.parse(initial).provider
      : '',
  );
  const [covers, setCovers] = useState(
    initial !== null && props.section === 'credit_protection'
      ? creditProtectionPayloadSchema.parse(initial).covers
      : '',
  );
  const [company, setCompany] = useState(
    initial !== null && props.section === 'insurance_policies'
      ? insurancePayloadSchema.parse(initial).company
      : '',
  );
  const [kind, setKind] = useState(
    initial !== null && props.section === 'insurance_policies'
      ? insurancePayloadSchema.parse(initial).kind
      : '',
  );
  const [beneficiaries, setBeneficiaries] = useState(
    initial !== null && props.section === 'insurance_policies'
      ? insurancePayloadSchema.parse(initial).beneficiaries.map((person) => ({
          name: person.name,
          relationship: textValue(person.relationship),
          share: textValue(person.share),
        }))
      : [{ name: '', relationship: '', share: '' }],
  );
  const [billsLocation, setBillsLocation] = useState(
    initial !== null && props.section === 'bills_and_cancellations'
      ? billsPayloadSchema.parse(initial).billsLocation
      : '',
  );
  const [subscriptions, setSubscriptions] = useState(
    initial !== null && props.section === 'bills_and_cancellations'
      ? billsPayloadSchema.parse(initial).subscriptions.map((item) => ({
          name: item.name,
          howToCancel: item.howToCancel,
        }))
      : [{ name: '', howToCancel: '' }],
  );
  const [appleHeir, setAppleHeir] = useState(
    initial !== null && props.section === 'digital_legacy'
      ? textValue(digitalLegacyPayloadSchema.parse(initial).appleHeirContact)
      : '',
  );
  const [googleInactive, setGoogleInactive] = useState(
    initial !== null && props.section === 'digital_legacy'
      ? textValue(digitalLegacyPayloadSchema.parse(initial).googleInactiveAccount)
      : '',
  );
  const [kitLocation, setKitLocation] = useState(
    initial !== null && props.section === 'digital_legacy'
      ? textValue(digitalLegacyPayloadSchema.parse(initial).passwordKitLocation)
      : '',
  );
  const [notes, setNotes] = useState(() => notesOf(props.section, initial));
  const [localError, setLocalError] = useState<string | null>(null);
  const shownError = localError ?? props.error;

  function submit(): void {
    const optional = (value: string) => {
      const trimmed = value.trim();
      return trimmed.length === 0 ? undefined : trimmed;
    };
    if (props.section === 'family_accounts') {
      props.onSubmit(
        familyAccountPayloadSchema.parse({
          schema: 1,
          institution,
          relationship,
          holder,
          ...(optional(branch) === undefined ? {} : { branch: optional(branch) }),
          ...(optional(referenceHint) === undefined ? {} : { referenceHint: optional(referenceHint) }),
          ...(optional(notes) === undefined ? {} : { notes: optional(notes) }),
        }),
      );
      return;
    }
    if (props.section === 'mortgages') {
      props.onSubmit(
        mortgagePayloadSchema.parse({
          schema: 1,
          lender,
          property,
          ...(optional(notes) === undefined ? {} : { notes: optional(notes) }),
        }),
      );
      return;
    }
    if (props.section === 'credit_protection') {
      props.onSubmit(
        creditProtectionPayloadSchema.parse({
          schema: 1,
          provider,
          covers,
          ...(optional(notes) === undefined ? {} : { notes: optional(notes) }),
        }),
      );
      return;
    }
    if (props.section === 'insurance_policies') {
      props.onSubmit(
        insurancePayloadSchema.parse({
          schema: 1,
          company,
          kind,
          beneficiaries: beneficiaries
            .filter((person) => person.name.trim().length > 0)
            .map((person) => ({
              name: person.name,
              ...(optional(person.relationship) === undefined
                ? {}
                : { relationship: optional(person.relationship) }),
              ...(optional(person.share) === undefined ? {} : { share: optional(person.share) }),
            })),
          ...(optional(notes) === undefined ? {} : { notes: optional(notes) }),
        }),
      );
      return;
    }
    if (props.section === 'bills_and_cancellations') {
      props.onSubmit(
        billsPayloadSchema.parse({
          schema: 1,
          billsLocation,
          subscriptions: subscriptions
            .filter((item) => item.name.trim().length > 0 || item.howToCancel.trim().length > 0)
            .map((item) => ({ name: item.name, howToCancel: item.howToCancel })),
          ...(optional(notes) === undefined ? {} : { notes: optional(notes) }),
        }),
      );
      return;
    }
    props.onSubmit(
      digitalLegacyPayloadSchema.parse({
        schema: 1,
        ...(optional(appleHeir) === undefined ? {} : { appleHeirContact: optional(appleHeir) }),
        ...(optional(googleInactive) === undefined
          ? {}
          : { googleInactiveAccount: optional(googleInactive) }),
        ...(optional(kitLocation) === undefined ? {} : { passwordKitLocation: optional(kitLocation) }),
        ...(optional(notes) === undefined ? {} : { notes: optional(notes) }),
      }),
    );
  }

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        setLocalError(null);
        try {
          submit();
        } catch (caught) {
          setLocalError(vaultProblemText(caught));
        }
      }}
    >
      {props.section === 'family_accounts' ? (
        <>
          <Field label={m.vaultInstitution()} htmlFor="vault-institution">
            <Input
              id="vault-institution"
              value={institution}
              onChange={(event) => setInstitution(event.target.value)}
            />
          </Field>
          <Field label={m.vaultRelationship()} htmlFor="vault-relationship">
            <Select
              value={relationship}
              onValueChange={(value) => {
                const next = BANK_RELATIONSHIPS.find((item) => item === value);
                if (next !== undefined) {
                  setRelationship(next);
                }
              }}
            >
              <SelectTrigger id="vault-relationship">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BANK_RELATIONSHIPS.map((item) => (
                  <SelectItem key={item} value={item}>
                    {relationshipLabel(item)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={m.vaultHolder()} htmlFor="vault-holder">
            <Input id="vault-holder" value={holder} onChange={(event) => setHolder(event.target.value)} />
          </Field>
          <Field label={m.vaultBranch()} htmlFor="vault-branch">
            <Input id="vault-branch" value={branch} onChange={(event) => setBranch(event.target.value)} />
          </Field>
          <Field label={m.vaultReferenceHint()} htmlFor="vault-reference" hint={m.vaultReferenceHelp()}>
            <Input
              id="vault-reference"
              value={referenceHint}
              onChange={(event) => setReferenceHint(event.target.value)}
            />
          </Field>
        </>
      ) : null}
      {props.section === 'mortgages' ? (
        <>
          <Field label={m.vaultLender()} htmlFor="vault-lender">
            <Input id="vault-lender" value={lender} onChange={(event) => setLender(event.target.value)} />
          </Field>
          <Field label={m.vaultProperty()} htmlFor="vault-property">
            <Input
              id="vault-property"
              value={property}
              onChange={(event) => setProperty(event.target.value)}
            />
          </Field>
        </>
      ) : null}
      {props.section === 'credit_protection' ? (
        <>
          <Field label={m.vaultProvider()} htmlFor="vault-provider">
            <Input
              id="vault-provider"
              value={provider}
              onChange={(event) => setProvider(event.target.value)}
            />
          </Field>
          <Field label={m.vaultCovers()} htmlFor="vault-covers">
            <Textarea id="vault-covers" value={covers} onChange={(event) => setCovers(event.target.value)} />
          </Field>
        </>
      ) : null}
      {props.section === 'insurance_policies' ? (
        <>
          <Field label={m.vaultCompany()} htmlFor="vault-company">
            <Input id="vault-company" value={company} onChange={(event) => setCompany(event.target.value)} />
          </Field>
          <Field label={m.vaultPolicyKind()} htmlFor="vault-kind">
            <Input id="vault-kind" value={kind} onChange={(event) => setKind(event.target.value)} />
          </Field>
          {beneficiaries.map((person, index) => (
            <div key={index} className="grid gap-2 border-t border-border pt-3">
              <Field label={m.vaultBeneficiaryName()} htmlFor={`beneficiary-${String(index)}`}>
                <Input
                  id={`beneficiary-${String(index)}`}
                  value={person.name}
                  onChange={(event) => updateRow(setBeneficiaries, index, { name: event.target.value })}
                />
              </Field>
              <Field label={m.vaultBeneficiaryRelation()} htmlFor={`beneficiary-rel-${String(index)}`}>
                <Input
                  id={`beneficiary-rel-${String(index)}`}
                  value={person.relationship}
                  onChange={(event) =>
                    updateRow(setBeneficiaries, index, { relationship: event.target.value })
                  }
                />
              </Field>
              <Field label={m.vaultBeneficiaryShare()} htmlFor={`beneficiary-share-${String(index)}`}>
                <Input
                  id={`beneficiary-share-${String(index)}`}
                  value={person.share}
                  onChange={(event) => updateRow(setBeneficiaries, index, { share: event.target.value })}
                />
              </Field>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() => setBeneficiaries((rows) => [...rows, { name: '', relationship: '', share: '' }])}
          >
            {m.vaultAddBeneficiary()}
          </Button>
        </>
      ) : null}
      {props.section === 'bills_and_cancellations' ? (
        <>
          <Field label={m.vaultBillsLocation()} htmlFor="vault-bills">
            <Textarea
              id="vault-bills"
              value={billsLocation}
              onChange={(event) => setBillsLocation(event.target.value)}
            />
          </Field>
          {subscriptions.map((item, index) => (
            <div key={index} className="grid gap-2 border-t border-border pt-3">
              <Field label={m.vaultSubscriptionName()} htmlFor={`cancel-${String(index)}`}>
                <Input
                  id={`cancel-${String(index)}`}
                  value={item.name}
                  onChange={(event) => updateRow(setSubscriptions, index, { name: event.target.value })}
                />
              </Field>
              <Field label={m.vaultHowToCancel()} htmlFor={`cancel-how-${String(index)}`}>
                <Input
                  id={`cancel-how-${String(index)}`}
                  value={item.howToCancel}
                  onChange={(event) =>
                    updateRow(setSubscriptions, index, { howToCancel: event.target.value })
                  }
                />
              </Field>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() => setSubscriptions((rows) => [...rows, { name: '', howToCancel: '' }])}
          >
            {m.vaultAddSubscription()}
          </Button>
        </>
      ) : null}
      {props.section === 'digital_legacy' ? (
        <>
          <Field label={m.vaultAppleHeir()} htmlFor="vault-apple">
            <Input
              id="vault-apple"
              value={appleHeir}
              onChange={(event) => setAppleHeir(event.target.value)}
            />
          </Field>
          <Field label={m.vaultGoogleInactive()} htmlFor="vault-google">
            <Textarea
              id="vault-google"
              value={googleInactive}
              onChange={(event) => setGoogleInactive(event.target.value)}
            />
          </Field>
          <Field label={m.vaultKitLocation()} htmlFor="vault-kit">
            <Input
              id="vault-kit"
              value={kitLocation}
              onChange={(event) => setKitLocation(event.target.value)}
            />
          </Field>
        </>
      ) : null}
      <Field label={m.vaultNotes()} htmlFor="vault-notes">
        <Textarea id="vault-notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
      </Field>
      {shownError === null ? null : <FieldNote error={shownError} />}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="min-h-12" disabled={props.busy}>
          {props.busy ? m.vaultSaving() : m.vaultSave()}
        </Button>
        {props.onCancel === undefined ? null : (
          <Button type="button" variant="ghost" onClick={props.onCancel}>
            {m.vaultCancel()}
          </Button>
        )}
      </div>
    </form>
  );
}

function notesOf(section: FamilyVaultSection, payload: VaultPayload | null): string {
  if (payload === null) {
    return '';
  }
  switch (section) {
    case 'family_accounts':
      return textValue(familyAccountPayloadSchema.parse(payload).notes);
    case 'mortgages':
      return textValue(mortgagePayloadSchema.parse(payload).notes);
    case 'credit_protection':
      return textValue(creditProtectionPayloadSchema.parse(payload).notes);
    case 'insurance_policies':
      return textValue(insurancePayloadSchema.parse(payload).notes);
    case 'bills_and_cancellations':
      return textValue(billsPayloadSchema.parse(payload).notes);
    case 'digital_legacy':
      return textValue(digitalLegacyPayloadSchema.parse(payload).notes);
  }
}

function updateRow<T extends object>(
  setRows: (update: (rows: T[]) => T[]) => void,
  index: number,
  patch: Partial<T>,
): void {
  setRows((rows) => rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
}
