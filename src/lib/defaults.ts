import { resolveConfiguredTier } from '@/lib/licensing';
import { createEmptyResidentTaxBlock } from '@/lib/checklist-defaults';
import {
  createEmptyFamilyServices,
  emptyMobilePlan,
  ensurePersonalSubscriptions,
} from '@/lib/service-catalog';
import type {
  DomusRunbookDocument,
  EncryptedVaultPayload,
  PetRecord,
  PublicHouseData,
  ResidentHealthRecord,
} from '@/types/domus';

/** Genera un id locale senza dipendenze (crypto.randomUUID quando disponibile). */
export function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createEmptyPublicHouse(): PublicHouseData {
  return {
    houseName: '',
    utilities: {
      waterCutoff: { location: '', instructions: '' },
      gasCutoff: { location: '', instructions: '' },
      electricPanel: { breakerLocation: '', externalMeterLocation: '' },
      heatingBoiler: { location: '', notes: '' },
    },
    wifi: { ssid: '', password: '' },
    wasteSchedule: [],
    artisanContacts: [],
    familyServices: createEmptyFamilyServices(),
  };
}

export function createEmptyResident(): ResidentHealthRecord {
  return {
    id: createId(),
    fullName: '',
    birthYear: new Date().getFullYear() - 30,
    bloodGroup: 'UNKNOWN',
    allergies: [],
    chronicConditions: [],
    medicalDevices: [],
    lifesavingMedicines: [],
    mobilityStatus: 'FULLY_AUTONOMOUS',
    sleepingRoom: '',
    iceContacts: [],
    taxChecklist: createEmptyResidentTaxBlock(),
    mobilePlan: emptyMobilePlan(),
    personalSubscriptions: ensurePersonalSubscriptions(undefined),
    personalBankAccounts: [],
  };
}

export function createEmptyPet(): PetRecord {
  return {
    name: '',
    species: 'Cane',
    panicHideouts: '',
    vetEmergencyH24: {
      clinicName: '',
      phone: '',
      address: '',
    },
  };
}

/**
 * Payload vuoto della cassaforte patrimoniale (Livello 3).
 * Mai persistito in chiaro: solo cifrato via `encryptVault` dopo conferma PIN.
 */
export function createEmptyVaultPayload(): EncryptedVaultPayload {
  return {
    bankAccounts: [],
    lifeInsurances: [],
    laborAndPension: {
      socialSecurityInstitution: '',
      supplementaryPensionFund: '',
      tfrStorageLocation: 'IN_AZIENDA',
      hrContact: '',
    },
    utilitiesLocations: {
      lastBillsFolderLocation: '',
      activeSubscriptionsToRevoke: [],
    },
    digitalLegacy: {
      appleLegacyContactActive: false,
      googleInactiveManagerActive: false,
      passwordManagerKitLocation: '',
    },
  };
}

/** Documento iniziale offline; tier da env self-host (default BASIC). */
export function createEmptyRunbook(): DomusRunbookDocument {
  return {
    version: '1.0.0',
    documentId: createId(),
    updatedAt: new Date().toISOString(),
    tier: resolveConfiguredTier(),
    level1_public: createEmptyPublicHouse(),
    level2_ice: {
      residents: [],
      pets: [],
    },
  };
}
