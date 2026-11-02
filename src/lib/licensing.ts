import type { AccountLicenseState } from '@/types/account';
import type { LicenseConfig, LicenseTier } from '@/types/domus';
import { effectiveTierFromLicense } from '@/lib/trial';

/**
 * Limiti funzionali per piano. Il Feature Gate Engine legge solo questa mappa:
 * nessuna chiamata di rete obbligatoria in modalità self-host / offline BASIC.
 */
export const TIER_LIMITS: Record<LicenseTier, LicenseConfig['features']> = {
  BASIC: {
    maxHouses: 1,
    allowLevel3Vault: false,
    allowCloudSync: false,
    allowSmsAlerts: false,
    customBranding: false,
    auditLog: false,
  },
  ADVANCED: {
    maxHouses: 3,
    allowLevel3Vault: true,
    allowCloudSync: true,
    allowSmsAlerts: false,
    customBranding: false,
    auditLog: false,
  },
  PREMIUM: {
    maxHouses: 999,
    allowLevel3Vault: true,
    allowCloudSync: true,
    allowSmsAlerts: true,
    customBranding: true,
    auditLog: true,
  },
};

/** BASIC: max 2 schede ICE; ADVANCED/PREMIUM: illimitati. */
export const MAX_RESIDENTS_BY_TIER: Record<LicenseTier, number> = {
  BASIC: 2,
  ADVANCED: Number.POSITIVE_INFINITY,
  PREMIUM: Number.POSITIVE_INFINITY,
};

/** Tier predefinito per installazioni self-host senza chiave SaaS. */
export const DEFAULT_TIER: LicenseTier = 'BASIC';

const VALID_TIERS: ReadonlySet<string> = new Set([
  'BASIC',
  'ADVANCED',
  'PREMIUM',
]);

/**
 * Risolve il piano attivo da `NEXT_PUBLIC_DOMUSAFE_TIER` (self-host / test).
 * Valori ammessi: BASIC | ADVANCED | PREMIUM. Qualsiasi altro valore → BASIC.
 * Non richiede rete: sicuro da usare anche offline.
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
 * Utilizzato sia nei componenti UI per nascondere/bloccare sezioni,
 * sia nella logica di salvataggio/esportazione.
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
 * Watermark di stampa DomuSafe: solo BASIC (PRD).
 * ADVANCED/PREMIUM stampano senza watermark (privacy flap resta).
 */
export function shouldShowPrintWatermark(tier: LicenseTier): boolean {
  return tier === 'BASIC';
}

/**
 * Costruisce una LicenseConfig locale (self-host) senza firma SaaS.
 * La firma Ed25519 resta opzionale e riservata al percorso cloud.
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
 * altrimenti `baseTier` (dopo scadenza torna BASIC o piano pagato precedente).
 */
export function resolveEffectiveTier(
  license: AccountLicenseState,
  nowMs?: number
): LicenseTier {
  return effectiveTierFromLicense(license, nowMs);
}

/** Etichette italiane brevi per UI licenze. */
export const TIER_LABELS: Record<LicenseTier, string> = {
  BASIC: 'Basic',
  ADVANCED: 'Advanced',
  PREMIUM: 'Premium',
};
