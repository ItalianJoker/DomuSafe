/**
 * Helper server: verifica Premium (+ trial) per route API Premium-only.
 */
import type { AccountLicenseState } from '@/types/account';
import type { LicenseConfig, LicenseTier } from '@/types/domus';
import { canAccessFeature, resolveEffectiveTier } from '@/lib/licensing';

export function accountEffectiveTier(
  license: AccountLicenseState
): LicenseTier {
  return resolveEffectiveTier(license);
}

export function accountCanAccess(
  license: AccountLicenseState,
  feature: keyof LicenseConfig['features']
): boolean {
  return canAccessFeature(resolveEffectiveTier(license), feature);
}

export const PREMIUM_REQUIRED_MESSAGE =
  'Funzione riservata al piano Premium (o prova attiva)';
