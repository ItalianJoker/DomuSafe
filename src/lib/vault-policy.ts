/**
 * Policy Cassaforte vs piano: Advanced = solo documenti Famiglia;
 * Premium (+ trial) = anche patrimonio personale + custom fields.
 */
import type { EncryptedVaultPayload } from '@/types/domus';
import { createEmptyVaultPayload } from '@/lib/defaults';

/**
 * Rimuove campi Premium dal payload prima della cifratura se il piano non li ammette.
 * Evita che dati personali restino nel ciphertext dopo fine trial.
 */
export function enforceVaultPayloadForTier(
  payload: EncryptedVaultPayload,
  options: { allowPersonal: boolean; allowCustomFields: boolean }
): EncryptedVaultPayload {
  const empty = createEmptyVaultPayload();
  const next: EncryptedVaultPayload = {
    bankAccounts: options.allowPersonal ? payload.bankAccounts : [],
    lifeInsurances: options.allowPersonal ? payload.lifeInsurances : [],
    laborAndPension: options.allowPersonal
      ? payload.laborAndPension
      : empty.laborAndPension,
    utilitiesLocations: payload.utilitiesLocations,
    digitalLegacy: payload.digitalLegacy,
  };
  if (options.allowCustomFields && payload.customFields?.length) {
    next.customFields = payload.customFields;
  }
  return next;
}
