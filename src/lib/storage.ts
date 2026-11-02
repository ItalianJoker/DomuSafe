import { get, set, del } from 'idb-keyval';
import type { DomusRunbookDocument, LicenseTier } from '@/types/domus';
import { createEmptyRunbook } from '@/lib/defaults';
import {
  canAddHouse,
  resolveConfiguredTier,
} from '@/lib/licensing';

/** Chiave legacy MVP: un solo runbook (migrata automaticamente). */
export const RUNBOOK_STORAGE_KEY = 'domusafe:runbook:v1';

/** Collezione multi-casa (ADVANCED ≤3, PREMIUM illimitate). */
export const HOUSES_STORAGE_KEY = 'domusafe:houses:v1';

/**
 * Collezione locale di abitazioni DomuSafe.
 * Ogni casa è un `DomusRunbookDocument` completo (L1/L2/L3 opzionale).
 */
export interface DomusHouseCollection {
  version: '1.0.0';
  activeDocumentId: string;
  houses: DomusRunbookDocument[];
}

function applyConfiguredTier(
  document: DomusRunbookDocument
): DomusRunbookDocument {
  const tier = resolveConfiguredTier();
  if (document.tier === tier) {
    return document;
  }
  return { ...document, tier };
}

function applyTierToCollection(
  collection: DomusHouseCollection
): DomusHouseCollection {
  return {
    ...collection,
    houses: collection.houses.map(applyConfiguredTier),
  };
}

function createFreshCollection(): DomusHouseCollection {
  const house = createEmptyRunbook();
  return {
    version: '1.0.0',
    activeDocumentId: house.documentId,
    houses: [house],
  };
}

/**
 * Carica la collezione abitazioni da IndexedDB.
 * Migra il runbook singolo MVP se presente; applica il tier da env.
 */
export async function loadHouseCollection(): Promise<DomusHouseCollection> {
  const stored = await get<DomusHouseCollection>(HOUSES_STORAGE_KEY);
  if (
    stored &&
    stored.version === '1.0.0' &&
    Array.isArray(stored.houses) &&
    stored.houses.length > 0
  ) {
    const next = applyTierToCollection(stored);
    const activeExists = next.houses.some(
      (h) => h.documentId === next.activeDocumentId
    );
    if (!activeExists) {
      next.activeDocumentId = next.houses[0]!.documentId;
    }
    await set(HOUSES_STORAGE_KEY, next);
    return next;
  }

  const legacy = await get<DomusRunbookDocument>(RUNBOOK_STORAGE_KEY);
  if (legacy && legacy.version === '1.0.0') {
    const migrated: DomusHouseCollection = {
      version: '1.0.0',
      activeDocumentId: legacy.documentId,
      houses: [applyConfiguredTier(legacy)],
    };
    await set(HOUSES_STORAGE_KEY, migrated);
    await del(RUNBOOK_STORAGE_KEY);
    return migrated;
  }

  const fresh = createFreshCollection();
  await set(HOUSES_STORAGE_KEY, fresh);
  return fresh;
}

/** Documento attivo nella collezione (mai `undefined` se la collezione è valida). */
export function getActiveHouse(
  collection: DomusHouseCollection
): DomusRunbookDocument {
  const active = collection.houses.find(
    (h) => h.documentId === collection.activeDocumentId
  );
  return active ?? collection.houses[0]!;
}

/**
 * Carica il documento DomuSafe attivo da IndexedDB.
 * Se assente, crea e persiste un runbook vuoto al tier configurato.
 */
export async function loadRunbook(): Promise<DomusRunbookDocument> {
  const collection = await loadHouseCollection();
  return getActiveHouse(collection);
}

/** Persiste l'intero documento attivo aggiornando `updatedAt`. */
export async function saveRunbook(
  document: DomusRunbookDocument
): Promise<DomusRunbookDocument> {
  const collection = await loadHouseCollection();
  const nextDoc: DomusRunbookDocument = {
    ...document,
    updatedAt: new Date().toISOString(),
  };
  const houses = collection.houses.map((h) =>
    h.documentId === nextDoc.documentId ? nextDoc : h
  );
  const hasDoc = houses.some((h) => h.documentId === nextDoc.documentId);
  const nextHouses = hasDoc ? houses : [...houses, nextDoc];

  const next: DomusHouseCollection = {
    version: '1.0.0',
    activeDocumentId: nextDoc.documentId,
    houses: nextHouses,
  };
  await set(HOUSES_STORAGE_KEY, next);
  return nextDoc;
}

/**
 * Aggiunge un'abitazione se il piano lo consente (BASIC 1, ADVANCED 3, …).
 * Restituisce la collezione aggiornata o `null` se il limite è raggiunto.
 */
export async function addHouse(
  tier: LicenseTier = resolveConfiguredTier()
): Promise<DomusHouseCollection | null> {
  const collection = await loadHouseCollection();
  if (!canAddHouse(tier, collection.houses.length)) {
    return null;
  }
  const house = createEmptyRunbook();
  const next: DomusHouseCollection = {
    version: '1.0.0',
    activeDocumentId: house.documentId,
    houses: [...collection.houses, house],
  };
  await set(HOUSES_STORAGE_KEY, next);
  return next;
}

/** Seleziona l'abitazione attiva per id. */
export async function switchActiveHouse(
  documentId: string
): Promise<DomusHouseCollection | null> {
  const collection = await loadHouseCollection();
  const exists = collection.houses.some((h) => h.documentId === documentId);
  if (!exists) {
    return null;
  }
  const next: DomusHouseCollection = {
    ...collection,
    activeDocumentId: documentId,
  };
  await set(HOUSES_STORAGE_KEY, next);
  return next;
}

/**
 * Rimuove un'abitazione. Ne deve restare almeno una.
 * Se si rimuove l'attiva, passa alla prima rimanente.
 */
export async function removeHouse(
  documentId: string
): Promise<DomusHouseCollection | null> {
  const collection = await loadHouseCollection();
  if (collection.houses.length <= 1) {
    return null;
  }
  const houses = collection.houses.filter((h) => h.documentId !== documentId);
  if (houses.length === collection.houses.length) {
    return null;
  }
  const activeDocumentId =
    collection.activeDocumentId === documentId
      ? houses[0]!.documentId
      : collection.activeDocumentId;
  const next: DomusHouseCollection = {
    version: '1.0.0',
    activeDocumentId,
    houses,
  };
  await set(HOUSES_STORAGE_KEY, next);
  return next;
}

/**
 * Sostituisce l'intera collezione (es. dopo download sync E2EE).
 * Applica il tier configurato a ogni casa.
 */
export async function replaceHouseCollection(
  collection: DomusHouseCollection
): Promise<DomusHouseCollection> {
  if (
    collection.version !== '1.0.0' ||
    !Array.isArray(collection.houses) ||
    collection.houses.length === 0
  ) {
    throw new Error('Collezione sync non valida');
  }
  const next = applyTierToCollection({
    version: '1.0.0',
    activeDocumentId: collection.activeDocumentId,
    houses: collection.houses,
  });
  const activeExists = next.houses.some(
    (h) => h.documentId === next.activeDocumentId
  );
  if (!activeExists) {
    next.activeDocumentId = next.houses[0]!.documentId;
  }
  await set(HOUSES_STORAGE_KEY, next);
  return next;
}

/** Cancella runbook/collezione locale (reset fabbrica). */
export async function clearRunbook(): Promise<void> {
  await del(RUNBOOK_STORAGE_KEY);
  await del(HOUSES_STORAGE_KEY);
}
