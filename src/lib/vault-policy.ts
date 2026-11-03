/**
 * Policy Cassaforte vs piano:
 * Advanced = documenti Famiglia (utenze/eredità + conti bancari Famiglia);
 * Premium (+ trial) = anche patrimonio personale (polizze, lavoro) + custom fields.
 * Conti personali → scheda Residente (enforceResidentForTier).
 */
import type {
  EncryptedVaultPayload,
  ResidentHealthRecord,
} from '@/types/domus';
import { createEmptyVaultPayload } from '@/lib/defaults';
import {
  ensurePersonalSubscriptions,
  stripCustomServiceEntries,
  stripFamilyServicesForTier,
} from '@/lib/service-catalog';
import type { PublicHouseData } from '@/types/domus';

/**
 * Rimuove campi Premium dal payload vault prima della cifratura se il piano non li ammette.
 * I conti bancari Famiglia restano anche su Advanced.
 */
export function enforceVaultPayloadForTier(
  payload: EncryptedVaultPayload,
  options: { allowPersonal: boolean; allowCustomFields: boolean }
): EncryptedVaultPayload {
  const empty = createEmptyVaultPayload();
  const next: EncryptedVaultPayload = {
    // Conti Famiglia: Advanced+ (non strippati).
    bankAccounts: payload.bankAccounts ?? [],
    // Mutui/CPI: patrimonio personale → Premium.
    mortgages: options.allowPersonal ? payload.mortgages ?? [] : [],
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

/**
 * Applica i gate piano su Casa (utenze/abbonamenti Famiglia + custom).
 */
export function enforcePublicHouseForTier(
  data: PublicHouseData,
  options: { allowCustomFields: boolean }
): PublicHouseData {
  const familyServices = stripFamilyServicesForTier(
    data.familyServices,
    options.allowCustomFields
  );
  const next: PublicHouseData = {
    ...data,
    familyServices,
  };
  if (!options.allowCustomFields) {
    delete next.customFields;
  }
  return next;
}

/**
 * Applica i gate piano sulla scheda Residente:
 * - servizi personalizzati: allowCustomFields
 * - conti bancari personali: allowPersonalPatrimonio
 */
export function enforceResidentForTier(
  resident: ResidentHealthRecord,
  options: {
    allowCustomFields: boolean;
    allowPersonalPatrimonio: boolean;
  }
): ResidentHealthRecord {
  const subscriptions = ensurePersonalSubscriptions(
    resident.personalSubscriptions
  );
  const next: ResidentHealthRecord = {
    ...resident,
    personalSubscriptions: options.allowCustomFields
      ? subscriptions
      : stripCustomServiceEntries(subscriptions),
  };
  if (!options.allowCustomFields) {
    delete next.customFields;
  }
  if (!options.allowPersonalPatrimonio) {
    delete next.personalBankAccounts;
  } else if (!next.personalBankAccounts) {
    next.personalBankAccounts = [];
  }
  return next;
}
