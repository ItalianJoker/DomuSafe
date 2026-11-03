/**
 * Sessione sync E2EE — cifrata con data-key account, persistita su Famiglia.
 * Nessun IndexedDB: la chiave sync non è fonte di verità nel browser.
 */
import type { SyncSession } from '@/lib/crypto-sync';
import {
  decryptJsonAtRest,
  encryptJsonAtRest,
} from '@/lib/crypto-auth';

export async function loadSyncSession(
  familyId: string,
  dataKey: CryptoKey
): Promise<SyncSession | null> {
  const res = await fetch(`/api/family/${familyId}/sync-session`);
  if (!res.ok) return null;
  const data = (await res.json()) as {
    blob: { ivBase64: string; ciphertextBase64: string } | null;
  };
  if (!data.blob) return null;
  const stored = await decryptJsonAtRest<SyncSession>(data.blob, dataKey);
  if (
    typeof stored.syncId !== 'string' ||
    typeof stored.keyBase64 !== 'string' ||
    typeof stored.revision !== 'number'
  ) {
    return null;
  }
  return stored;
}

export async function saveSyncSession(
  familyId: string,
  dataKey: CryptoKey,
  session: SyncSession
): Promise<void> {
  const sealed = await encryptJsonAtRest(session, dataKey);
  const res = await fetch(`/api/family/${familyId}/sync-session`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      blob: {
        version: 'enc-1',
        ivBase64: sealed.ivBase64,
        ciphertextBase64: sealed.ciphertextBase64,
        updatedAt: new Date().toISOString(),
      },
    }),
  });
  if (!res.ok) throw new Error('Salvataggio sessione sync non riuscito');
}

export async function clearSyncSession(familyId: string): Promise<void> {
  await fetch(`/api/family/${familyId}/sync-session`, { method: 'DELETE' });
}
