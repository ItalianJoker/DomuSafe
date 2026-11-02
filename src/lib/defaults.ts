import { DEFAULT_TIER } from '@/lib/licensing';
import type {
  DomusRunbookDocument,
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

/** Documento iniziale offline a tier BASIC (nessun mock di dati reali). */
export function createEmptyRunbook(): DomusRunbookDocument {
  return {
    version: '1.0.0',
    documentId: createId(),
    updatedAt: new Date().toISOString(),
    tier: DEFAULT_TIER,
    level1_public: createEmptyPublicHouse(),
    level2_ice: {
      residents: [],
      pets: [],
    },
  };
}
