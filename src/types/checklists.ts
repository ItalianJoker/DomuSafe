/**
 * Checklist tasse IT (per scheda residente) e successione (accanto a L3).
 * Persistite nel runbook family-scoped già cifrato a riposo.
 */

/** Codici tipici dichiarazione / adempimenti IT. */
export type TaxItemCode =
  | 'CU'
  | 'PRECOMPILATA'
  | '730'
  | 'ISEE'
  | 'IMU'
  | 'TARI'
  | 'ACCONTI_IRPEF'
  | 'ALTRO';

export interface TaxCatalogItem {
  id: string;
  code: TaxItemCode;
  label: string;
  /** Finestra tipica in italiano (es. «entro il 30 novembre»). */
  typicalWindow: string;
  /** Mese di riferimento 1–12, se noto. */
  monthHint?: number;
}

/** Stato di una voce della checklist annuale per un residente. */
export interface ResidentTaxYearItem {
  catalogId: string;
  done: boolean;
  doneAt?: string;
  /** Nota sensibile (cifrata a riposo col runbook Famiglia). */
  note?: string;
}

export interface ResidentTaxYearChecklist {
  year: number;
  items: ResidentTaxYearItem[];
}

/** Blocco tasse sulla scheda residente (Livello 2). */
export interface ResidentTaxBlock {
  version: '1.0.0';
  years: ResidentTaxYearChecklist[];
  updatedAt: string;
}

export type SuccessionCategory =
  | 'DOCS'
  | 'CONTACTS'
  | 'WILL'
  | 'BANK'
  | 'INSURANCE'
  | 'DIGITAL'
  | 'DEADLINE';

export interface SuccessionChecklistItem {
  id: string;
  category: SuccessionCategory;
  label: string;
  done: boolean;
  note?: string;
  deadlineHint?: string;
}

/** Checklist successione family-scoped (patrimonio / contesto L3). */
export interface SuccessionChecklist {
  version: '1.0.0';
  familyId: string;
  items: SuccessionChecklistItem[];
  updatedAt: string;
}
