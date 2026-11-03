/**
 * Engagement progressivo: un passo alla volta (casa → residenti → emergenza → utenze → L3).
 * Niente overwhelm: al massimo un “prossimo passo” + checklist collassabile.
 */

import type { DomusRunbookDocument, LicenseTier } from '@/types/domus';
import { canAccessFeature } from '@/lib/licensing';

export type EngagementStepId =
  | 'casa'
  | 'residenti'
  | 'emergenza'
  | 'utenze'
  | 'l3';

export type EngagementTarget =
  | 'casa'
  | 'utenze'
  | 'personale'
  | 'servizi'
  | 'cassaforte'
  | 'stampa'
  | 'home'
  /** @deprecated alias → personale */
  | 'ice';

export type EngagementStep = {
  id: EngagementStepId;
  title: string;
  blurb: string;
  cta: string;
  target: EngagementTarget;
  done: boolean;
  /** Se false, lo step è “in arrivo” (es. L3 senza Advanced). */
  available: boolean;
  lockedHint?: string;
};

function hasCasaBasics(doc: DomusRunbookDocument): boolean {
  const l1 = doc.level1_public;
  return Boolean(
    l1.houseName.trim() &&
      (l1.utilities.waterCutoff.location.trim() ||
        l1.utilities.gasCutoff.location.trim() ||
        l1.utilities.electricPanel.breakerLocation.trim())
  );
}

function hasResidenti(doc: DomusRunbookDocument): boolean {
  return doc.level2_ice.residents.some((r) => r.fullName.trim().length > 0);
}

function hasEmergenza(doc: DomusRunbookDocument): boolean {
  return doc.level2_ice.residents.some(
    (r) =>
      r.allergies.length > 0 ||
      r.lifesavingMedicines.some((m) => m.name.trim()) ||
      r.iceContacts.some((c) => c.phoneNumber.trim())
  );
}

function hasUtenze(doc: DomusRunbookDocument): boolean {
  const services = doc.level1_public.familyServices;
  if (!services) return false;
  return (
    services.utilities.some(
      (u) =>
        Boolean(u.provider?.trim()) ||
        Boolean(u.customerCode?.trim()) ||
        Boolean(u.renewalDate?.trim())
    ) ||
    services.deadlines.some(
      (d) => Boolean(d.renewalDate?.trim()) || Boolean(d.notes?.trim())
    )
  );
}

function hasL3(doc: DomusRunbookDocument): boolean {
  return Boolean(doc.level3_vault?.ciphertextBase64);
}

/** Ordine fisso di engagement — un passo dopo l’altro. */
export function buildEngagementSteps(
  doc: DomusRunbookDocument,
  tier: LicenseTier
): EngagementStep[] {
  const allowL3 = canAccessFeature(tier, 'allowLevel3Vault');
  return [
    {
      id: 'casa',
      title: 'Casa: nome e chiusure',
      blurb: 'Dove chiudere acqua, gas e luce in pochi secondi.',
      cta: 'Completa Casa',
      target: 'casa',
      done: hasCasaBasics(doc),
      available: true,
    },
    {
      id: 'residenti',
      title: 'Aggiungi i residenti',
      blurb: 'Almeno una scheda con nome per chi vive in casa.',
      cta: 'Apri Personale',
      target: 'personale',
      done: hasResidenti(doc),
      available: true,
    },
    {
      id: 'emergenza',
      title: 'Dati utili al soccorso',
      blurb: 'Allergie, farmaci salvavita o un contatto di emergenza.',
      cta: 'Completa Personale',
      target: 'personale',
      done: hasEmergenza(doc),
      available: true,
    },
    {
      id: 'utenze',
      title: 'Utenze e scadenze',
      blurb: 'Luce, gas, internet o controllo caldaia — quando vuoi.',
      cta: 'Apri utenze',
      target: 'utenze',
      done: hasUtenze(doc),
      available: true,
    },
    {
      id: 'l3',
      title: 'Cassaforte Famiglia',
      blurb: 'Documenti e conti Famiglia protetti da PIN.',
      cta: 'Apri Cassaforte',
      target: 'cassaforte',
      done: hasL3(doc),
      available: allowL3,
      lockedHint: allowL3
        ? undefined
        : 'Disponibile da Advanced (o prova Premium).',
    },
  ];
}

export function engagementProgress(steps: EngagementStep[]): {
  done: number;
  total: number;
  percent: number;
  next: EngagementStep | null;
} {
  const actionable = steps.filter((s) => s.available);
  const done = actionable.filter((s) => s.done).length;
  const total = actionable.length;
  const next = actionable.find((s) => !s.done) ?? null;
  return {
    done,
    total,
    percent: total === 0 ? 100 : Math.round((done / total) * 100),
    next,
  };
}
