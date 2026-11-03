'use client';

/**
 * Servizi personali Residente: mobile, abbonamenti (auto/bollo…), conti bancari.
 * Conti personali: Premium (allowPersonalPatrimonio). Custom: Premium.
 */

import { Landmark, Plus, Smartphone, Trash2, WalletCards } from 'lucide-react';
import type {
  BankAccountRecord,
  LicenseTier,
  MobilePlanRecord,
  ServiceEntry,
} from '@/types/domus';
import { canAccessFeature } from '@/lib/licensing';
import { createId } from '@/lib/defaults';
import {
  PERSONAL_SUBSCRIPTION_CATALOG,
  emptyMobilePlan,
  ensurePersonalSubscriptions,
} from '@/lib/service-catalog';
import { FieldLabel, TouchInput, TouchTextarea } from '@/components/TouchField';
import { ServiceEntriesEditor } from '@/components/ServiceEntriesEditor';
import { FeatureGate } from '@/components/FeatureGate';

interface ResidentServicesPanelProps {
  tier: LicenseTier;
  mobilePlan: MobilePlanRecord | undefined;
  personalSubscriptions: ServiceEntry[] | undefined;
  personalBankAccounts: BankAccountRecord[] | undefined;
  onMobilePlanChange: (next: MobilePlanRecord) => void;
  onSubscriptionsChange: (next: ServiceEntry[]) => void;
  onBankAccountsChange: (next: BankAccountRecord[]) => void;
}

export function ResidentServicesPanel({
  tier,
  mobilePlan,
  personalSubscriptions,
  personalBankAccounts,
  onMobilePlanChange,
  onSubscriptionsChange,
  onBankAccountsChange,
}: ResidentServicesPanelProps) {
  const allowCustom = canAccessFeature(tier, 'allowCustomFields');
  const allowPersonalBanks = canAccessFeature(tier, 'allowPersonalPatrimonio');
  const plan = mobilePlan ?? emptyMobilePlan();
  const subscriptions = ensurePersonalSubscriptions(personalSubscriptions);
  const banks = personalBankAccounts ?? [];

  return (
    <div className="space-y-4 rounded-md border-2 border-emerald-900/40 bg-emerald-50/70 p-3">
      <h5 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-emerald-950">
        <WalletCards className="size-5" aria-hidden />
        Servizi e conti personali
      </h5>
      <p className="text-xs text-emerald-950/80">
        Tariffa mobile, abbonamenti personali e — con Premium — conti bancari di
        questo residente. Restano sulla scheda Residente, protetti col runbook.
      </p>

      <div className="space-y-3 rounded-md border border-emerald-900/30 bg-white/90 p-3">
        <h6 className="flex items-center gap-2 font-bold text-zinc-950">
          <Smartphone className="size-5" aria-hidden />
          Tariffa mobile
        </h6>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <FieldLabel>Operatore</FieldLabel>
            <TouchInput
              value={plan.carrier}
              placeholder="Es. TIM, Vodafone, Iliad…"
              onChange={(e) =>
                onMobilePlanChange({ ...plan, carrier: e.target.value })
              }
            />
          </div>
          <div>
            <FieldLabel>Nome piano / offerta</FieldLabel>
            <TouchInput
              value={plan.planName}
              placeholder="Es. Giga 150"
              onChange={(e) =>
                onMobilePlanChange({ ...plan, planName: e.target.value })
              }
            />
          </div>
          <div>
            <FieldLabel>Numero</FieldLabel>
            <TouchInput
              value={plan.phoneNumber}
              inputMode="tel"
              placeholder="+39…"
              onChange={(e) =>
                onMobilePlanChange({ ...plan, phoneNumber: e.target.value })
              }
            />
          </div>
          <div>
            <FieldLabel>Rinnovo / scadenza</FieldLabel>
            <TouchInput
              type="date"
              value={plan.renewalDate ?? ''}
              onChange={(e) =>
                onMobilePlanChange({ ...plan, renewalDate: e.target.value })
              }
            />
          </div>
          <div className="sm:col-span-2">
            <FieldLabel>Note</FieldLabel>
            <TouchInput
              value={plan.notes ?? ''}
              placeholder="PIN SIM, PUK, dove è il contratto…"
              onChange={(e) =>
                onMobilePlanChange({ ...plan, notes: e.target.value })
              }
            />
          </div>
        </div>
      </div>

      <ServiceEntriesEditor
        title="Abbonamenti personali"
        description="Assicurazione auto, bollo e altri servizi del residente."
        catalog={PERSONAL_SUBSCRIPTION_CATALOG}
        entries={subscriptions}
        onChange={onSubscriptionsChange}
        allowCustom={allowCustom}
      />

      <FeatureGate
        tier={tier}
        feature="allowPersonalPatrimonio"
        fallback={
          <p className="rounded-md border-2 border-amber-800 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950">
            Conti bancari personali: disponibili con Premium (o prova). I conti
            di Famiglia sono nella Cassaforte (Advanced+).
          </p>
        }
      >
        {allowPersonalBanks ? (
          <BankAccountsEditor
            title="Conti bancari personali"
            description="Conti intestati a questo residente (non i conti Famiglia)."
            accounts={banks}
            onChange={onBankAccountsChange}
          />
        ) : null}
      </FeatureGate>
    </div>
  );
}

export function BankAccountsEditor({
  title,
  description,
  accounts,
  onChange,
}: {
  title: string;
  description?: string;
  accounts: BankAccountRecord[];
  onChange: (next: BankAccountRecord[]) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="flex items-center gap-2 text-base font-bold text-zinc-950">
            <Landmark className="size-5" aria-hidden />
            {title}
          </h4>
          {description ? (
            <p className="text-xs text-zinc-600">{description}</p>
          ) : null}
        </div>
        <button
          type="button"
          className="inline-flex min-h-12 items-center gap-2 rounded-md border-2 border-zinc-900 bg-white px-4 font-bold hover:bg-zinc-100"
          onClick={() =>
            onChange([
              ...accounts,
              {
                id: createId(),
                institution: '',
                accountType: '',
                ownershipDetails: '',
                ibanHint: '',
                notes: '',
              },
            ])
          }
        >
          <Plus className="size-5" aria-hidden />
          Aggiungi conto
        </button>
      </div>

      {accounts.length === 0 ? (
        <p className="text-sm text-zinc-700">Nessun conto inserito.</p>
      ) : (
        <ul className="space-y-3">
          {accounts.map((account, index) => (
            <li
              key={account.id}
              className="space-y-3 rounded-md border-2 border-zinc-800 bg-white p-3"
            >
              <div className="flex justify-end">
                <button
                  type="button"
                  aria-label={`Rimuovi conto ${index + 1}`}
                  className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-md border-2 border-red-800 bg-white text-red-900"
                  onClick={() =>
                    onChange(accounts.filter((_, i) => i !== index))
                  }
                >
                  <Trash2 className="size-5" aria-hidden />
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <FieldLabel>Istituto</FieldLabel>
                  <TouchInput
                    value={account.institution}
                    placeholder="Es. Intesa, Fineco…"
                    onChange={(e) => {
                      const next = [...accounts];
                      next[index] = {
                        ...account,
                        institution: e.target.value,
                      };
                      onChange(next);
                    }}
                  />
                </div>
                <div>
                  <FieldLabel>Tipo conto</FieldLabel>
                  <TouchInput
                    value={account.accountType}
                    placeholder="Corrente, deposito…"
                    onChange={(e) => {
                      const next = [...accounts];
                      next[index] = {
                        ...account,
                        accountType: e.target.value,
                      };
                      onChange(next);
                    }}
                  />
                </div>
                <div className="sm:col-span-2">
                  <FieldLabel>Intestazione / dettagli</FieldLabel>
                  <TouchInput
                    value={account.ownershipDetails}
                    placeholder="Intestatario, cointestazione…"
                    onChange={(e) => {
                      const next = [...accounts];
                      next[index] = {
                        ...account,
                        ownershipDetails: e.target.value,
                      };
                      onChange(next);
                    }}
                  />
                </div>
                <div className="sm:col-span-2">
                  <FieldLabel>Riferimento IBAN (parziale)</FieldLabel>
                  <TouchInput
                    value={account.ibanHint ?? ''}
                    placeholder="Ultime cifre o dove trovi l’IBAN completo"
                    onChange={(e) => {
                      const next = [...accounts];
                      next[index] = { ...account, ibanHint: e.target.value };
                      onChange(next);
                    }}
                  />
                </div>
                <div className="sm:col-span-2">
                  <FieldLabel>Note</FieldLabel>
                  <TouchTextarea
                    value={account.notes ?? ''}
                    onChange={(e) => {
                      const next = [...accounts];
                      next[index] = { ...account, notes: e.target.value };
                      onChange(next);
                    }}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
