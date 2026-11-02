import { get, set, del } from 'idb-keyval';
import type { DomusRunbookDocument } from '@/types/domus';
import { createEmptyRunbook } from '@/lib/defaults';

/** Chiave IndexedDB per il runbook attivo (una sola casa in BASIC). */
export const RUNBOOK_STORAGE_KEY = 'domusafe:runbook:v1';

/**
 * Carica il documento DomuSafe da IndexedDB.
 * Se assente, crea e persiste un runbook vuoto a tier BASIC.
 */
export async function loadRunbook(): Promise<DomusRunbookDocument> {
  const stored = await get<DomusRunbookDocument>(RUNBOOK_STORAGE_KEY);
  if (stored && stored.version === '1.0.0') {
    return stored;
  }
  const fresh = createEmptyRunbook();
  await set(RUNBOOK_STORAGE_KEY, fresh);
  return fresh;
}

/** Persiste l'intero documento aggiornando `updatedAt`. */
export async function saveRunbook(
  document: DomusRunbookDocument
): Promise<DomusRunbookDocument> {
  const next: DomusRunbookDocument = {
    ...document,
    updatedAt: new Date().toISOString(),
  };
  await set(RUNBOOK_STORAGE_KEY, next);
  return next;
}

/** Cancella il runbook locale (reset fabbrica). */
export async function clearRunbook(): Promise<void> {
  await del(RUNBOOK_STORAGE_KEY);
}
