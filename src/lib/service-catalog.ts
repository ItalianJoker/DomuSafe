/**
 * Cataloghi standard utenze / abbonamenti / scadenze (binding utilities-subscriptions).
 * Free/Basic/Advanced: solo queste voci; Premium (+ trial): + servizi/campi personalizzati.
 */

import type {
  CustomField,
  FamilyServicesBlock,
  MobilePlanRecord,
  ServiceEntry,
} from '@/types/domus';

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export type ServiceCatalogItem = {
  id: string;
  label: string;
  hint?: string;
};

/** Utenze Famiglia: Luce, Gas, Internet + Acqua, TARI. */
export const FAMILY_UTILITY_CATALOG: readonly ServiceCatalogItem[] = [
  { id: 'luce', label: 'Luce', hint: 'POD / codice cliente' },
  { id: 'gas', label: 'Gas', hint: 'PDR / codice cliente' },
  { id: 'internet', label: 'Internet', hint: 'Operatore e contratto' },
  { id: 'acqua', label: 'Acqua', hint: 'Gestore idrico' },
  { id: 'tari', label: 'TARI', hint: 'Tassa rifiuti' },
] as const;

/** Abbonamenti / servizi familiari. */
export const FAMILY_SUBSCRIPTION_CATALOG: readonly ServiceCatalogItem[] = [
  {
    id: 'assicurazione_casa',
    label: 'Assicurazione casa',
    hint: 'Polizza abitazione',
  },
  {
    id: 'allarme',
    label: 'Allarme / videosorveglianza',
    hint: 'Contratto sicurezza',
  },
  {
    id: 'streaming_famiglia',
    label: 'Streaming / TV famiglia',
    hint: 'Abbonamento condiviso',
  },
] as const;

/** Scadenze familiari ricorrenti. */
export const FAMILY_DEADLINE_CATALOG: readonly ServiceCatalogItem[] = [
  {
    id: 'controllo_caldaia',
    label: 'Controllo caldaia',
    hint: 'Manutenzione annuale',
  },
  {
    id: 'verifica_impianto_elettrico',
    label: 'Verifica impianto elettrico',
    hint: 'Quando prevista',
  },
  {
    id: 'pulizia_canne_fumarie',
    label: 'Pulizia canne fumarie',
    hint: 'Stagionale',
  },
  {
    id: 'rinnovo_assicurazione_casa',
    label: 'Rinnovo assicurazione casa',
    hint: 'Data rinnovo polizza',
  },
] as const;

/** Abbonamenti / servizi personali sul Residente. */
export const PERSONAL_SUBSCRIPTION_CATALOG: readonly ServiceCatalogItem[] = [
  {
    id: 'assicurazione_auto',
    label: 'Assicurazione auto',
    hint: 'RCA / kasko',
  },
  { id: 'bollo', label: 'Bollo auto', hint: 'Tassa di possesso' },
  {
    id: 'revisione_auto',
    label: 'Revisione auto',
    hint: 'Scadenza revisione',
  },
  {
    id: 'assicurazione_personale',
    label: 'Assicurazione personale',
    hint: 'Infortuni / tutela',
  },
] as const;

export function emptyServiceEntry(catalogId: string): ServiceEntry {
  return {
    catalogId,
    provider: '',
    customerCode: '',
    phone: '',
    notes: '',
    renewalDate: '',
  };
}

export function emptyMobilePlan(): MobilePlanRecord {
  return {
    carrier: '',
    planName: '',
    phoneNumber: '',
    notes: '',
    renewalDate: '',
  };
}

function mergeCatalogEntries(
  catalog: readonly ServiceCatalogItem[],
  existing: ServiceEntry[] | undefined
): ServiceEntry[] {
  const byId = new Map((existing ?? []).map((e) => [e.catalogId, e]));
  const fromCatalog = catalog.map(
    (item) => byId.get(item.id) ?? emptyServiceEntry(item.id)
  );
  // Conserva voci personalizzate (catalogId non in catalogo standard).
  const standardIds = new Set(catalog.map((c) => c.id));
  const custom = (existing ?? []).filter((e) => !standardIds.has(e.catalogId));
  return [...fromCatalog, ...custom];
}

/** Garantisce le voci standard Famiglia; preserva custom Premium. */
export function ensureFamilyServices(
  block: FamilyServicesBlock | undefined
): FamilyServicesBlock {
  return {
    version: '1.0.0',
    utilities: mergeCatalogEntries(FAMILY_UTILITY_CATALOG, block?.utilities),
    subscriptions: mergeCatalogEntries(
      FAMILY_SUBSCRIPTION_CATALOG,
      block?.subscriptions
    ),
    deadlines: mergeCatalogEntries(FAMILY_DEADLINE_CATALOG, block?.deadlines),
    customFields: block?.customFields,
  };
}

export function createEmptyFamilyServices(): FamilyServicesBlock {
  return ensureFamilyServices(undefined);
}

/** Garantisce le voci standard personali sul Residente. */
export function ensurePersonalSubscriptions(
  existing: ServiceEntry[] | undefined
): ServiceEntry[] {
  return mergeCatalogEntries(PERSONAL_SUBSCRIPTION_CATALOG, existing);
}

export function catalogLabel(
  catalog: readonly ServiceCatalogItem[],
  catalogId: string
): string {
  return catalog.find((c) => c.id === catalogId)?.label ?? catalogId;
}

/** Aggiunge un servizio personalizzato (Premium). */
export function addCustomServiceEntry(
  list: ServiceEntry[],
  label: string
): ServiceEntry[] {
  const id = `custom-${newId()}`;
  return [
    ...list,
    {
      ...emptyServiceEntry(id),
      provider: label,
      notes: '',
    },
  ];
}

export function stripCustomServiceEntries(list: ServiceEntry[]): ServiceEntry[] {
  return list.filter((e) => !e.catalogId.startsWith('custom-'));
}

export function stripFamilyServicesForTier(
  block: FamilyServicesBlock | undefined,
  allowCustomFields: boolean
): FamilyServicesBlock | undefined {
  if (!block) return undefined;
  const next = ensureFamilyServices(block);
  if (!allowCustomFields) {
    next.utilities = stripCustomServiceEntries(next.utilities);
    next.subscriptions = stripCustomServiceEntries(next.subscriptions);
    next.deadlines = stripCustomServiceEntries(next.deadlines);
    delete next.customFields;
  }
  return next;
}

export function stripPersonalServicesForTier(
  subscriptions: ServiceEntry[] | undefined,
  customFields: CustomField[] | undefined,
  allowCustomFields: boolean
): { subscriptions?: ServiceEntry[]; customFields?: CustomField[] } {
  const ensured = ensurePersonalSubscriptions(subscriptions);
  if (!allowCustomFields) {
    return { subscriptions: stripCustomServiceEntries(ensured) };
  }
  return {
    subscriptions: ensured,
    customFields,
  };
}
