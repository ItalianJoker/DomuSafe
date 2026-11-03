import type { AccountLicenseState } from '@/types/account';
import type { LicenseConfig, LicenseTier } from '@/types/domus';
import { effectiveTierFromLicense } from '@/lib/trial';

/**
 * Limiti funzionali per piano (binding docs/license-tiers.md).
 * Feature Gate Engine: unica mappa; zero rete in self-host.
 *
 * Free → L1+L2, 1 residente, watermark
 * Basic → L1+L2, residenti illimitati, watermark
 * Advanced → + L3 documenti Famiglia, no watermark; no tasse / patrimonio personale / sync
 * Premium → tutto (tasse, patrimonio personale, successione, sync E2EE, …)
 */
export const TIER_LIMITS: Record<LicenseTier, LicenseConfig['features']> = {
  FREE: {
    maxHouses: 1,
    allowLevel3Vault: false,
    allowPersonalPatrimonio: false,
    allowResidentTax: false,
    allowSuccessionChecklist: false,
    allowCloudSync: false,
    allowCustomFields: false,
    allowSmsAlerts: false,
    customBranding: false,
    auditLog: false,
  },
  BASIC: {
    maxHouses: 1,
    allowLevel3Vault: false,
    allowPersonalPatrimonio: false,
    allowResidentTax: false,
    allowSuccessionChecklist: false,
    allowCloudSync: false,
    allowCustomFields: false,
    allowSmsAlerts: false,
    customBranding: false,
    auditLog: false,
  },
  ADVANCED: {
    maxHouses: 3,
    allowLevel3Vault: true,
    allowPersonalPatrimonio: false,
    allowResidentTax: false,
    allowSuccessionChecklist: false,
    allowCloudSync: false,
    allowCustomFields: false,
    allowSmsAlerts: false,
    customBranding: false,
    auditLog: false,
  },
  PREMIUM: {
    maxHouses: 999,
    allowLevel3Vault: true,
    allowPersonalPatrimonio: true,
    allowResidentTax: true,
    allowSuccessionChecklist: true,
    allowCloudSync: true,
    allowCustomFields: true,
    allowSmsAlerts: true,
    customBranding: true,
    auditLog: true,
  },
};

/** Free: 1 scheda ICE; Basic+: illimitati. */
export const MAX_RESIDENTS_BY_TIER: Record<LicenseTier, number> = {
  FREE: 1,
  BASIC: Number.POSITIVE_INFINITY,
  ADVANCED: Number.POSITIVE_INFINITY,
  PREMIUM: Number.POSITIVE_INFINITY,
};

/** Tier predefinito per installazioni self-host senza chiave SaaS. */
export const DEFAULT_TIER: LicenseTier = 'FREE';

const VALID_TIERS: ReadonlySet<string> = new Set([
  'FREE',
  'BASIC',
  'ADVANCED',
  'PREMIUM',
]);

/**
 * Risolve il piano attivo da `NEXT_PUBLIC_DOMUSAFE_TIER` (self-host / test).
 * Valori ammessi: FREE | BASIC | ADVANCED | PREMIUM. Altro → FREE.
 */
export function resolveConfiguredTier(
  envValue: string | undefined = process.env.NEXT_PUBLIC_DOMUSAFE_TIER
): LicenseTier {
  const normalized = envValue?.trim().toUpperCase();
  if (normalized && VALID_TIERS.has(normalized)) {
    return normalized as LicenseTier;
  }
  return DEFAULT_TIER;
}

/**
 * Verifica se l'operazione richiesta è permessa nel piano corrente.
 * Usato in UI (FeatureGate) e logica di salvataggio/esportazione.
 */
export function canAccessFeature(
  currentTier: LicenseTier,
  feature: keyof LicenseConfig['features']
): boolean {
  const value = TIER_LIMITS[currentTier]?.[feature];
  if (typeof value === 'number') {
    return value > 0;
  }
  return Boolean(value);
}

/** Numero massimo di abitazioni ammesse dal piano attivo. */
export function getMaxHouses(tier: LicenseTier): number {
  return TIER_LIMITS[tier].maxHouses;
}

/** True se è ancora possibile aggiungere un'abitazione. */
export function canAddHouse(tier: LicenseTier, currentCount: number): boolean {
  return currentCount < getMaxHouses(tier);
}

/** Numero massimo di residenti ICE ammessi dal piano attivo. */
export function getMaxResidents(tier: LicenseTier): number {
  return MAX_RESIDENTS_BY_TIER[tier];
}

/** True se è ancora possibile aggiungere una scheda residente. */
export function canAddResident(
  tier: LicenseTier,
  currentCount: number
): boolean {
  return currentCount < getMaxResidents(tier);
}

/**
 * Watermark di stampa DomuSafe: Free e Basic.
 * Advanced/Premium stampano senza watermark (privacy flap resta).
 */
export function shouldShowPrintWatermark(tier: LicenseTier): boolean {
  return tier === 'FREE' || tier === 'BASIC';
}

/**
 * Costruisce una LicenseConfig locale (self-host) senza firma SaaS.
 */
export function createLocalLicense(
  tier: LicenseTier = resolveConfiguredTier(),
  issuedTo = 'Self-Host'
): LicenseConfig {
  return {
    tier,
    issuedTo,
    features: { ...TIER_LIMITS[tier] },
  };
}

/**
 * Piano effettivo per Feature Gate: trial Premium attivo → PREMIUM,
 * altrimenti `baseTier` (dopo scadenza torna Free/Basic/…).
 */
export function resolveEffectiveTier(
  license: AccountLicenseState,
  nowMs?: number
): LicenseTier {
  return effectiveTierFromLicense(license, nowMs);
}

/** Etichette italiane brevi per UI licenze. */
export const TIER_LABELS: Record<LicenseTier, string> = {
  FREE: 'Free',
  BASIC: 'Basic',
  ADVANCED: 'Advanced',
  PREMIUM: 'Premium',
};
