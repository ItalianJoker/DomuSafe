/** Livelli di sottoscrizione supportati */
export type LicenseTier = 'BASIC' | 'ADVANCED' | 'PREMIUM';

/** Licenza crittografica o impostazione d'ambiente */
export interface LicenseConfig {
  tier: LicenseTier;
  issuedTo: string;
  /** Token firmato Ed25519 per verificare l'autenticità in modalità SaaS */
  signature?: string;
  features: {
    maxHouses: number;
    allowLevel3Vault: boolean;
    allowCloudSync: boolean;
    allowSmsAlerts: boolean;
    customBranding: boolean;
    auditLog: boolean;
  };
}

export type BloodGroup =
  | '0-'
  | '0+'
  | 'A-'
  | 'A+'
  | 'B-'
  | 'B+'
  | 'AB-'
  | 'AB+'
  | 'UNKNOWN';

export type EvacuationMobility =
  | 'FULLY_AUTONOMOUS'
  | 'REDUCED_MOBILITY'
  | 'NON_AMBULATORY'
  | 'SENSORY_IMPAIRMENT';

export interface EmergencyContact {
  priority: 1 | 2 | 3;
  name: string;
  relationship: string;
  phoneNumber: string;
  hasHouseKeys: boolean;
}

export interface LifesavingMedicine {
  name: string;
  dosageSchedule: string;
  physicalLocationInHouse: string;
}

/** Checklist tasse IT annuale sulla scheda residente (cifrata a riposo col runbook). */
export interface ResidentTaxYearItem {
  catalogId: string;
  done: boolean;
  doneAt?: string;
  note?: string;
}

export interface ResidentTaxBlock {
  version: '1.0.0';
  years: Array<{
    year: number;
    items: ResidentTaxYearItem[];
  }>;
  updatedAt: string;
}

export interface ResidentHealthRecord {
  id: string;
  fullName: string;
  birthYear: number;
  bloodGroup: BloodGroup;
  allergies: string[];
  chronicConditions: string[];
  medicalDevices: string[];
  lifesavingMedicines: LifesavingMedicine[];
  mobilityStatus: EvacuationMobility;
  sleepingRoom: string;
  iceContacts: EmergencyContact[];
  /** Adempimenti fiscali IT per questo residente (730, ISEE, IMU…). */
  taxChecklist?: ResidentTaxBlock;
}

export interface PetRecord {
  name: string;
  species: 'Cane' | 'Gatto' | 'Altro';
  panicHideouts: string;
  vetEmergencyH24: {
    clinicName: string;
    phone: string;
    address: string;
  };
}

export interface PublicHouseData {
  houseName: string;
  utilities: {
    waterCutoff: { location: string; instructions: string };
    gasCutoff: { location: string; instructions: string };
    electricPanel: { breakerLocation: string; externalMeterLocation: string };
    heatingBoiler: { location: string; notes?: string };
  };
  wifi: {
    ssid: string;
    password: string;
  };
  wasteSchedule: Array<{ day: string; fractions: string[] }>;
  artisanContacts: Array<{ trade: string; name: string; phone: string }>;
}

export interface EncryptedVaultPayload {
  bankAccounts: Array<{
    institution: string;
    accountType: string;
    ownershipDetails: string;
    notes?: string;
  }>;
  lifeInsurances: Array<{
    company: string;
    policyNumber: string;
    type: 'TCM' | 'VITA_RISPARMIO' | 'INFORTUNI';
    beneficiariesSummary: string;
  }>;
  laborAndPension: {
    socialSecurityInstitution: string;
    supplementaryPensionFund?: string;
    tfrStorageLocation: 'IN_AZIENDA' | 'FONDO_CATEGORIA';
    hrContact: string;
  };
  utilitiesLocations: {
    lastBillsFolderLocation: string;
    activeSubscriptionsToRevoke: string[];
  };
  digitalLegacy: {
    appleLegacyContactActive: boolean;
    googleInactiveManagerActive: boolean;
    passwordManagerKitLocation: string;
  };
}

export interface DomusRunbookDocument {
  version: '1.0.0';
  documentId: string;
  updatedAt: string;
  tier: LicenseTier;
  level1_public: PublicHouseData;
  level2_ice: {
    residents: ResidentHealthRecord[];
    pets: PetRecord[];
  };
  level3_vault?: {
    saltBase64: string;
    ivBase64: string;
    ciphertextBase64: string;
  };
}
