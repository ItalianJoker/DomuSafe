'use client';

/**
 * FeatureGate — nasconde o sostituisce UI in base al Feature Gate Engine.
 * Livello di accesso: dipende dalla feature (es. allowLevel3Vault = L3).
 */

import type { ReactNode } from 'react';
import type { LicenseConfig, LicenseTier } from '@/types/domus';
import { canAccessFeature } from '@/lib/licensing';

interface FeatureGateProps {
  tier: LicenseTier;
  feature: keyof LicenseConfig['features'];
  /** Mostrato quando il piano non include la feature (messaggio UX chiaro). */
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Renderizza `children` solo se `canAccessFeature(tier, feature)` è true.
 * Altrimenti mostra `fallback` (o nulla). Nessuna eccezione, zero rete.
 */
export function FeatureGate({
  tier,
  feature,
  fallback = null,
  children,
}: FeatureGateProps) {
  if (canAccessFeature(tier, feature)) {
    return <>{children}</>;
  }
  return <>{fallback}</>;
}
