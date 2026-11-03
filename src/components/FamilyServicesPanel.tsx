'use client';

/**
 * Utenze, abbonamenti e scadenze Famiglia — sezione Casa.
 * Persistenza account → Famiglia (runbook cifrato). Catalogo standard tutti i piani;
 * servizi/campi personalizzati: Premium (+ trial).
 */

import { CalendarClock, PlugZap, Shield } from 'lucide-react';
import type { FamilyServicesBlock, LicenseTier } from '@/types/domus';
import { canAccessFeature } from '@/lib/licensing';
import {
  FAMILY_DEADLINE_CATALOG,
  FAMILY_SUBSCRIPTION_CATALOG,
  FAMILY_UTILITY_CATALOG,
  ensureFamilyServices,
} from '@/lib/service-catalog';
import { ServiceEntriesEditor } from '@/components/ServiceEntriesEditor';
import { CustomFieldsEditor } from '@/components/CustomFieldsEditor';
import { FeatureGate } from '@/components/FeatureGate';

interface FamilyServicesPanelProps {
  tier: LicenseTier;
  value: FamilyServicesBlock | undefined;
  onChange: (next: FamilyServicesBlock) => void;
}

export function FamilyServicesPanel({
  tier,
  value,
  onChange,
}: FamilyServicesPanelProps) {
  const block = ensureFamilyServices(value);
  const allowCustom = canAccessFeature(tier, 'allowCustomFields');

  const update = (patch: Partial<FamilyServicesBlock>) => {
    const next = ensureFamilyServices({ ...block, ...patch });
    if (!allowCustom) {
      delete next.customFields;
    }
    onChange(next);
  };

  return (
    <section
      aria-labelledby="family-services-title"
      className="space-y-6 rounded-lg border-2 border-[var(--brand-forest)] bg-[var(--brand-cream)]/50 p-4"
    >
      <header>
        <h3
          id="family-services-title"
          className="flex items-center gap-2 text-lg font-black text-[var(--brand-ink)]"
        >
          <PlugZap className="size-6" aria-hidden />
          Utenze, abbonamenti e scadenze
        </h3>
        <p className="mt-1 text-sm text-zinc-700">
          Contratti e scadenze di tutta la Famiglia (Luce, Gas, Internet, caldaia…).
          Restano protetti con i dati della casa.
        </p>
      </header>

      <div className="space-y-8">
        <div>
          <p className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-[var(--brand-forest)]">
            <PlugZap className="size-4" aria-hidden />
            Utenze
          </p>
          <ServiceEntriesEditor
            title="Luce, Gas, Internet e altre"
            description="Gestori e codici cliente delle utenze domestiche."
            catalog={FAMILY_UTILITY_CATALOG}
            entries={block.utilities}
            onChange={(utilities) => update({ utilities })}
            allowCustom={allowCustom}
          />
        </div>

        <div>
          <p className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-[var(--brand-forest)]">
            <Shield className="size-4" aria-hidden />
            Abbonamenti familiari
          </p>
          <ServiceEntriesEditor
            title="Servizi della casa"
            description="Assicurazione casa e altri abbonamenti condivisi."
            catalog={FAMILY_SUBSCRIPTION_CATALOG}
            entries={block.subscriptions}
            onChange={(subscriptions) => update({ subscriptions })}
            allowCustom={allowCustom}
          />
        </div>

        <div>
          <p className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-[var(--brand-forest)]">
            <CalendarClock className="size-4" aria-hidden />
            Scadenze familiari
          </p>
          <ServiceEntriesEditor
            title="Manutenzioni e rinnovi"
            description="Es. controllo caldaia e altre scadenze ricorrenti."
            catalog={FAMILY_DEADLINE_CATALOG}
            entries={block.deadlines}
            onChange={(deadlines) => update({ deadlines })}
            allowCustom={allowCustom}
            showPhone={false}
          />
        </div>

        <FeatureGate tier={tier} feature="allowCustomFields">
          <CustomFieldsEditor
            title="Campi personalizzati (utenze Famiglia)"
            fields={block.customFields}
            onChange={(customFields) => update({ customFields })}
          />
        </FeatureGate>
      </div>
    </section>
  );
}
