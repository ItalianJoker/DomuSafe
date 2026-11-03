/** Livelli di sottoscrizione supportati (binding: Free / Basic / Advanced / Premium). */
export type LicenseTier = 'FREE' | 'BASIC' | 'ADVANCED' | 'PREMIUM';

/** Licenza crittografica o impostazione d'ambiente */
export interface LicenseConfig {
  tier: LicenseTier;
  issuedTo: string;
  /** Token firmato Ed25519 per verificare l'autenticità in modalità SaaS */
  signature?: string;
  features: {
    maxHouses: number;
    /** Livello 3 cassaforte (documenti Famiglia su Advanced; tutto su Premium). */
    allowLevel3Vault: boolean;
    /**
     * Sezioni patrimoniali personali in cassaforte (conti, polizze, lavoro).
     * Solo Premium (+ trial). Advanced resta su documenti Famiglia.
     */
    allowPersonalPatrimonio: boolean;
    /** Checklist tasse IT sulle schede residenti — solo Premium (+ trial). */
    allowResidentTax: boolean;
    /** Checklist successione Famiglia — solo Premium (+ trial). */
    allowSuccessionChecklist: boolean;
    /** Sync cloud E2EE multi-device — solo Premium (+ trial). */
    allowCloudSync: boolean;
    /**
     * Campi personalizzati oltre agli standard (L1/L2/L3).
     * Solo Premium (+ trial). Free/Basic/Advanced = campi standard only.
     */
    allowCustomFields: boolean;
    allowSmsAlerts: boolean;
    customBranding: boolean;
    auditLog: boolean;
  };
}

/** Campo libero Premium: etichetta + valore, oltre allo schema standard. */
export interface CustomField {
  id: string;
  label: string;
  value: string;
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

/**
 * Voce utenza / abbonamento / scadenza (catalogo standard o custom-*).
 * Persistita nel runbook Famiglia (cifrato a riposo) o sulla scheda Residente.
 */
export interface ServiceEntry {
  catalogId: string;
  /** Gestore / compagnia / etichetta custom. */
  provider?: string;
  /** POD, PDR, codice cliente, targa… */
  customerCode?: string;
  phone?: string;
  notes?: string;
  /** Data scadenza / rinnovo (YYYY-MM-DD). */
  renewalDate?: string;
}

/** Piano mobile personale (scheda Residente). */
export interface MobilePlanRecord {
  carrier: string;
  planName: string;
  phoneNumber: string;
  notes?: string;
  renewalDate?: string;
}

/** Conto bancario (Famiglia in cassaforte Advanced+; personale su Residente Premium). */
export interface BankAccountRecord {
  id: string;
  institution: string;
  accountType: string;
  ownershipDetails: string;
  /** IBAN parziale o riferimento archivio — mai obbligatorio in chiaro completo. */
  ibanHint?: string;
  notes?: string;
}

/**
 * Utenze, abbonamenti e scadenze di Famiglia (Casa).
 * Free/Basic: catalogo standard; Premium: + customFields / voci custom-*.
 */
export interface FamilyServicesBlock {
  version: '1.0.0';
  utilities: ServiceEntry[];
  subscriptions: ServiceEntry[];
  deadlines: ServiceEntry[];
  /** Solo Premium (+ trial). */
  customFields?: CustomField[];
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
  /** Riferimento documento ID (metadati: dove si trova, non scansione completa). */
  idDocumentHint?: string;
  /** Foto riconoscitiva opzionale (data URL compressa). */
  photoDataUrl?: string;
  /** Adempimenti fiscali IT per questo residente (730, ISEE, IMU…). Premium. */
  taxChecklist?: ResidentTaxBlock;
  /** Tariffa / piano mobile personale. */
  mobilePlan?: MobilePlanRecord;
  /** Abbonamenti personali (Assicurazione Auto, Bollo…). */
  personalSubscriptions?: ServiceEntry[];
  /**
   * Conti bancari personali — solo Premium (+ trial), come patrimonio personale.
   * I conti Famiglia restano in cassaforte (Advanced+).
   */
  personalBankAccounts?: BankAccountRecord[];
  /** Solo Premium (+ trial): campi oltre allo schema standard. */
  customFields?: CustomField[];
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
  /** Solo Premium (+ trial): campi oltre allo schema standard. */
  customFields?: CustomField[];
}

/** Accesso fisico casa (citofono, cancello, pacchi). */
export interface HouseAccessInfo {
  intercom: string;
  gate: string;
  parcels: string;
}

/** Note house-sitting: animali e piante (oltre alle schede ICE pets). */
export interface HouseSittingInfo {
  animalsNotes: string;
  plantsNotes: string;
}

export interface PublicHouseData {
  houseName: string;
  utilities: {
    waterCutoff: {
      location: string;
      instructions: string;
      photoDataUrl?: string;
    };
    gasCutoff: {
      location: string;
      instructions: string;
      photoDataUrl?: string;
    };
    electricPanel: {
      breakerLocation: string;
      externalMeterLocation: string;
      photoDataUrl?: string;
    };
    heatingBoiler: {
      location: string;
      notes?: string;
      photoDataUrl?: string;
    };
  };
  wifi: {
    ssid: string;
    password: string;
  };
  wasteSchedule: Array<{ day: string; fractions: string[] }>;
  artisanContacts: Array<{ trade: string; name: string; phone: string }>;
  /** Citofono, cancello, consegna pacchi. */
  access?: HouseAccessInfo;
  /** Istruzioni house-sitting animali/piante. */
  houseSitting?: HouseSittingInfo;
  /**
   * Utenze (Luce/Gas/Internet…), abbonamenti e scadenze Famiglia.
   * Cifrati a riposo col runbook (account → Famiglia).
   */
  familyServices?: FamilyServicesBlock;
  /** Solo Premium (+ trial): campi oltre allo schema standard. */
  customFields?: CustomField[];
}

/**
 * Pacchetto break-glass L1+L2 per QR pubblico (senza login).
 * Solo metadati utili al soccorso — mai vault/PIN/password.
 */
export interface EmergencyBreakGlassPack {
  version: '1.0.0';
  familyName: string;
  houseName: string;
  publishedAt: string;
  level1: PublicHouseData;
  level2: {
    residents: ResidentHealthRecord[];
    pets: PetRecord[];
  };
}

export interface EncryptedVaultPayload {
  /**
   * Conti bancari **Famiglia** — documenti Famiglia, disponibili da Advanced in su.
   * I conti personali stanno sulla scheda Residente (Premium).
   */
  bankAccounts: Array<{
    institution: string;
    accountType: string;
    ownershipDetails: string;
    ibanHint?: string;
    notes?: string;
  }>;
  /** Mutui e CPI (metadati — no IBAN completo / password). Premium personale. */
  mortgages?: Array<{
    institution: string;
    kind: 'MUTUO' | 'CPI' | 'ALTRO';
    propertyRef: string;
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
  /** Solo Premium (+ trial): campi oltre allo schema standard della cassaforte. */
  customFields?: CustomField[];
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
