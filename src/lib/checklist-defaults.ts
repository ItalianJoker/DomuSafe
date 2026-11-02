import { createId } from '@/lib/defaults';
import type {
  ResidentTaxBlock,
  SuccessionChecklist,
  TaxCatalogItem,
} from '@/types/checklists';

/** Catalogo annuale tasse/adempimenti IT — copy semplice. */
export const TAX_CATALOG: TaxCatalogItem[] = [
  {
    id: 'tax-cu',
    code: 'CU',
    label: 'Certificazione Unica (CU) dal sostituto',
    typicalWindow: 'Di solito entro marzo',
    monthHint: 3,
  },
  {
    id: 'tax-precompilata',
    code: 'PRECOMPILATA',
    label: 'Dichiarazione precompilata disponibile',
    typicalWindow: 'Aprile–maggio (Agenzia Entrate)',
    monthHint: 4,
  },
  {
    id: 'tax-730',
    code: '730',
    label: 'Invio 730 / precompilata',
    typicalWindow: 'Entro termini annuali Agenzia Entrate (spesso settembre)',
    monthHint: 9,
  },
  {
    id: 'tax-isee',
    code: 'ISEE',
    label: 'ISEE aggiornato (se serve per bonus/scuola)',
    typicalWindow: 'All’inizio dell’anno o prima delle scadenze del beneficio',
    monthHint: 1,
  },
  {
    id: 'tax-imu',
    code: 'IMU',
    label: 'IMU (acconto / saldo)',
    typicalWindow: 'Acconto ~16 giugno · Saldo ~16 dicembre',
    monthHint: 6,
  },
  {
    id: 'tax-tari',
    code: 'TARI',
    label: 'TARI / bollettini rifiuti',
    typicalWindow: 'Secondo calendario del Comune',
  },
  {
    id: 'tax-acconti',
    code: 'ACCONTI_IRPEF',
    label: 'Acconti IRPEF (se dovuti)',
    typicalWindow: 'Giugno e novembre (verifica F24)',
    monthHint: 6,
  },
  {
    id: 'tax-altro',
    code: 'ALTRO',
    label: 'Altri adempimenti (IVA, canone, ecc.)',
    typicalWindow: 'Secondo la tua situazione',
  },
];

function emptyYear(year: number): ResidentTaxBlock['years'][number] {
  return {
    year,
    items: TAX_CATALOG.map((c) => ({ catalogId: c.id, done: false })),
  };
}

/** Blocco tasse vuoto sulla scheda residente, anno corrente. */
export function createEmptyResidentTaxBlock(
  year: number = new Date().getFullYear()
): ResidentTaxBlock {
  return {
    version: '1.0.0',
    years: [emptyYear(year)],
    updatedAt: new Date().toISOString(),
  };
}

/** Garantisce l’anno richiesto sulla scheda residente. */
export function ensureResidentTaxYear(
  block: ResidentTaxBlock | undefined,
  year: number = new Date().getFullYear()
): ResidentTaxBlock {
  const base = block ?? createEmptyResidentTaxBlock(year);
  if (base.years.some((y) => y.year === year)) {
    return base;
  }
  return {
    ...base,
    years: [...base.years, emptyYear(year)],
    updatedAt: new Date().toISOString(),
  };
}

/** Checklist successione per Famiglia (contesto patrimonio / L3). */
export function createDefaultSuccessionChecklist(
  familyId: string
): SuccessionChecklist {
  const now = new Date().toISOString();
  const rows: Array<{
    category: SuccessionChecklist['items'][number]['category'];
    label: string;
    deadlineHint?: string;
  }> = [
    {
      category: 'DOCS',
      label: 'Raccogliere documenti identità e stato di famiglia',
    },
    {
      category: 'DOCS',
      label: 'Elenco immobili e visure catastali aggiornate',
    },
    {
      category: 'WILL',
      label: 'Verificare testamento / disposizioni / legati',
    },
    {
      category: 'CONTACTS',
      label: 'Contatto notaio / avvocato di fiducia',
    },
    {
      category: 'BANK',
      label: 'Elenco conti e dossier titoli da notificare',
    },
    {
      category: 'INSURANCE',
      label: 'Polizze vita / TCM e beneficiari',
    },
    {
      category: 'DIGITAL',
      label: 'Legacy Apple / Google Inactive Manager / password manager',
    },
    {
      category: 'DEADLINE',
      label: 'Dichiarazione di successione (termini di legge)',
      deadlineHint: 'Di regola entro 12 mesi dal decesso',
    },
    {
      category: 'DEADLINE',
      label: 'Volture utenze e abbonamenti da chiudere',
    },
  ];

  return {
    version: '1.0.0',
    familyId,
    items: rows.map((r) => ({
      id: createId(),
      category: r.category,
      label: r.label,
      done: false,
      deadlineHint: r.deadlineHint,
    })),
    updatedAt: now,
  };
}
