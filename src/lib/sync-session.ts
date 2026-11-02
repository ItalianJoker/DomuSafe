/**
 * Persistenza locale della sessione sync (syncId + chiave).
 * Solo IndexedDB del device — la chiave non è mai mandata alle API di sync.
 */

import { get, set, del } from 'idb-keyval';
import type { SyncSession } from '@/lib/crypto-sync';

export const SYNC_SESSION_STORAGE_KEY = 'domusafe:sync-session:v1';

export async function loadSyncSession(): Promise<SyncSession | null> {
  const stored = await get<SyncSession>(SYNC_SESSION_STORAGE_KEY);
  if (
    !stored ||
    typeof stored.syncId !== 'string' ||
    typeof stored.keyBase64 !== 'string' ||
    typeof stored.revision !== 'number'
  ) {
    return null;
  }
  return stored;
}

export async function saveSyncSession(session: SyncSession): Promise<void> {
  await set(SYNC_SESSION_STORAGE_KEY, session);
}

export async function clearSyncSession(): Promise<void> {
  await del(SYNC_SESSION_STORAGE_KEY);
}
