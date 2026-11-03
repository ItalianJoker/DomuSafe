'use client';

/**
 * Personale → Servizi: tasse, mobile, abbonamenti, conti personali.
 * Stesso modello di Casa → Utenze: sottomenu dedicato, dati sulla scheda Residente.
 */

import { Receipt, UserRound, WalletCards } from 'lucide-react';
import type { LicenseTier, ResidentHealthRecord } from '@/types/domus';
import { canAccessFeature } from '@/lib/licensing';
import { enforceResidentForTier } from '@/lib/vault-policy';
import { FeatureGate } from '@/components/FeatureGate';
import { ResidentServicesPanel } from '@/components/ResidentServicesPanel';
import { ResidentTaxChecklist } from '@/components/ResidentTaxChecklist';
import { EmptyStateCta } from '@/components/EmptyStateCta';

interface PersonalServicesHubProps {
  tier: LicenseTier;
  residents: ResidentHealthRecord[];
  onResidentsChange: (residents: ResidentHealthRecord[]) => void;
  onOpenPersonale: () => void;
  onOpenAccount: () => void;
}

function patchResident(
  residents: ResidentHealthRecord[],
  id: string,
  patch: Partial<ResidentHealthRecord>,
  onChange: (next: ResidentHealthRecord[]) => void,
  tier: LicenseTier
) {
  onChange(
    residents.map((r) =>
      r.id === id
        ? enforceResidentForTier(
            { ...r, ...patch },
            {
              allowCustomFields: canAccessFeature(tier, 'allowCustomFields'),
              allowPersonalPatrimonio: canAccessFeature(
                tier,
                'allowPersonalPatrimonio'
              ),
            }
          )
        : r
    )
  );
}

export function PersonalServicesHub({
  tier,
  residents,
  onResidentsChange,
  onOpenPersonale,
  onOpenAccount,
}: PersonalServicesHubProps) {
  const allowTax = canAccessFeature(tier, 'allowResidentTax');

  return (
    <div className="space-y-4">
      <header>
        <p className="text-sm font-bold uppercase tracking-widest text-[var(--brand-forest)]">
          Personale · Servizi
        </p>
        <h2 className="mt-1 font-display text-2xl font-black text-[var(--brand-ink)]">
          Tasse, mobile, abbonamenti e conti
        </h2>
        <p className="mt-2 max-w-2xl text-base text-[var(--md-on-surface-variant)]">
          Tariffa mobile, abbonamenti personali (bollo, auto…), conti bancari
          personali e checklist tasse italiane — per ogni residente. Le schede
          sanitarie di emergenza restano in{' '}
          <button
            type="button"
            className="font-bold text-[var(--brand-forest)] underline"
            onClick={onOpenPersonale}
          >
            Personale
          </button>
          .
        </p>
        {!allowTax ? (
          <p className="mt-3 flex flex-wrap items-center gap-2 text-sm font-semibold text-amber-950 dark-contrast-amber">
            <Receipt className="size-4" aria-hidden />
            Checklist tasse e conti personali: con Premium (o prova).
            <button
              type="button"
              className="underline"
              onClick={onOpenAccount}
            >
              Apri Account
            </button>
          </p>
        ) : null}
      </header>

      {residents.length === 0 ? (
        <EmptyStateCta
          title="Nessun residente"
          body="Prima aggiungi una scheda residente in Personale (sanitario e contatti di emergenza). Poi qui gestisci mobile, abbonamenti, conti e tasse."
          cta="Apri Personale"
          onAction={onOpenPersonale}
        />
      ) : (
        <ul className="space-y-6">
          {residents.map((resident, index) => (
            <li
              key={resident.id}
              id={`servizi-resident-${resident.id}`}
              className="space-y-3 rounded-[var(--md-radius-md)] border-2 border-[var(--md-outline)] bg-[var(--md-surface-container)] p-4 shadow-[var(--md-elevation-1)]"
            >
              <h3 className="flex items-center gap-2 text-lg font-black text-[var(--md-on-surface)]">
                <UserRound className="size-6" aria-hidden />
                {resident.fullName.trim() || `Residente ${index + 1}`}
              </h3>
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-[var(--md-on-surface-variant)]">
                <WalletCards className="size-4" aria-hidden />
                Servizi di questo residente
              </p>

              <ResidentServicesPanel
                tier={tier}
                mobilePlan={resident.mobilePlan}
                personalSubscriptions={resident.personalSubscriptions}
                personalBankAccounts={resident.personalBankAccounts}
                onMobilePlanChange={(mobilePlan) =>
                  patchResident(
                    residents,
                    resident.id,
                    { mobilePlan },
                    onResidentsChange,
                    tier
                  )
                }
                onSubscriptionsChange={(personalSubscriptions) =>
                  patchResident(
                    residents,
                    resident.id,
                    { personalSubscriptions },
                    onResidentsChange,
                    tier
                  )
                }
                onBankAccountsChange={(personalBankAccounts) =>
                  patchResident(
                    residents,
                    resident.id,
                    { personalBankAccounts },
                    onResidentsChange,
                    tier
                  )
                }
              />

              <FeatureGate
                tier={tier}
                feature="allowResidentTax"
                fallback={
                  <p className="rounded-md border-2 border-amber-800 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950 dark-contrast-amber">
                    Checklist tasse e adempimenti italiani: inclusa in Premium
                    (o durante la prova). Apri Account per attivarla. I campi
                    restano sulla scheda residente.
                  </p>
                }
              >
                <ResidentTaxChecklist
                  taxChecklist={resident.taxChecklist}
                  onChange={(taxChecklist) =>
                    patchResident(
                      residents,
                      resident.id,
                      { taxChecklist },
                      onResidentsChange,
                      tier
                    )
                  }
                />
              </FeatureGate>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
