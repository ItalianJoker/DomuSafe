/**
 * Prova Premium 30 giorni — una sola volta per account.
 * Il Feature Gate legge `resolveEffectiveTier` (licensing.ts), non questo file
 * direttamente, così UI e limiti restano in un solo posto.
 */
import type { AccountLicenseState } from '@/types/account';
import type { LicenseTier } from '@/types/domus';

/** Durata prova Premium in millisecondi (30 giorni). */
export const PREMIUM_TRIAL_MS = 30 * 24 * 60 * 60 * 1000;

export const TRIAL_ALREADY_USED_MESSAGE =
  'La prova Premium è già stata usata su questo account';

export const TRIAL_ACTIVE_MESSAGE = 'Prova Premium già attiva';

/** True se `endsAt` ISO è ancora nel futuro. */
export function isTrialActive(
  license: AccountLicenseState,
  nowMs: number = Date.now()
): boolean {
  if (!license.trialEndsAt) return false;
  const ends = Date.parse(license.trialEndsAt);
  if (Number.isNaN(ends)) return false;
  return ends > nowMs;
}

/** True se il JWT SaaS è presente e non scaduto. */
export function isSaasLicenseActive(
  license: AccountLicenseState,
  nowMs: number = Date.now()
): boolean {
  if (!license.saasTier || !license.saasToken) return false;
  if (!license.saasExpiresAt) return true;
  const ends = Date.parse(license.saasExpiresAt);
  if (Number.isNaN(ends)) return false;
  return ends > nowMs;
}

/**
 * Piano effettivo: trial → SaaS JWT valido → `baseTier`.
 * Trial/SaaS scaduti non restano Premium: tornano al piano base.
 */
export function effectiveTierFromLicense(
  license: AccountLicenseState,
  nowMs: number = Date.now()
): LicenseTier {
  if (isTrialActive(license, nowMs)) {
    return 'PREMIUM';
  }
  if (isSaasLicenseActive(license, nowMs) && license.saasTier) {
    return license.saasTier;
  }
  return license.baseTier;
}

/**
 * Avvia la prova Premium una sola volta.
 * Restituisce il nuovo stato o un Error italiano se già usata/attiva.
 */
export function startPremiumTrial(
  license: AccountLicenseState,
  nowMs: number = Date.now()
): AccountLicenseState {
  if (isTrialActive(license, nowMs)) {
    throw new Error(TRIAL_ACTIVE_MESSAGE);
  }
  if (license.trialUsed) {
    throw new Error(TRIAL_ALREADY_USED_MESSAGE);
  }
  const started = new Date(nowMs);
  const ends = new Date(nowMs + PREMIUM_TRIAL_MS);
  return {
    ...license,
    trialUsed: true,
    trialStartedAt: started.toISOString(),
    trialEndsAt: ends.toISOString(),
  };
}

/** Giorni rimanenti di trial (0 se scaduto/assente); arrotondati per eccesso. */
export function trialDaysRemaining(
  license: AccountLicenseState,
  nowMs: number = Date.now()
): number {
  if (!isTrialActive(license, nowMs) || !license.trialEndsAt) return 0;
  const ends = Date.parse(license.trialEndsAt);
  return Math.max(0, Math.ceil((ends - nowMs) / (24 * 60 * 60 * 1000)));
}

/** Stato licenza iniziale per nuovo account (FREE, trial Premium disponibile). */
export function createInitialLicense(
  baseTier: LicenseTier = 'FREE'
): AccountLicenseState {
  return {
    baseTier,
    trialUsed: false,
  };
}
