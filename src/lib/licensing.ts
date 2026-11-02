import type { LicenseConfig, LicenseTier } from '@/types/domus';

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
 * Costruisce una LicenseConfig locale (self-host) senza firma SaaS.
 * La firma Ed25519 resta opzionale e riservata al percorso cloud.
 */
export function createLocalLicense(
  tier: LicenseTier = DEFAULT_TIER,
  issuedTo = 'Self-Host'
): LicenseConfig {
  return {
    tier,
    issuedTo,
    features: { ...TIER_LIMITS[tier] },
  };
}
