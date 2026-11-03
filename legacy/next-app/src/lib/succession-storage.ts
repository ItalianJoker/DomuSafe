/**
 * Checklist successione Famiglia — cifrata client-side, persistita su account server.
 */
import type { SuccessionChecklist } from '@/types/checklists';
import {
  decryptJsonAtRest,
  encryptJsonAtRest,
} from '@/lib/crypto-auth';
import { createDefaultSuccessionChecklist } from '@/lib/checklist-defaults';

async function fetchBlob(
  familyId: string
): Promise<{ ivBase64: string; ciphertextBase64: string } | null> {
  const res = await fetch(`/api/family/${familyId}/succession`);
  if (!res.ok) throw new Error('Impossibile caricare la checklist successione');
  const data = (await res.json()) as {
    blob: { ivBase64: string; ciphertextBase64: string } | null;
  };
  return data.blob;
}

async function putBlob(
  familyId: string,
  sealed: { ivBase64: string; ciphertextBase64: string }
): Promise<void> {
  const res = await fetch(`/api/family/${familyId}/succession`, {
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
  if (!res.ok) throw new Error('Salvataggio successione non riuscito');
}

export async function loadSuccessionChecklist(
  familyId: string,
  dataKey: CryptoKey
): Promise<SuccessionChecklist> {
  const blob = await fetchBlob(familyId);
  if (!blob) {
    const fresh = createDefaultSuccessionChecklist(familyId);
    await saveSuccessionChecklist(fresh, dataKey);
    return fresh;
  }
  const decrypted = await decryptJsonAtRest<SuccessionChecklist>(blob, dataKey);
  return { ...decrypted, familyId };
}

export async function saveSuccessionChecklist(
  checklist: SuccessionChecklist,
  dataKey: CryptoKey
): Promise<SuccessionChecklist> {
  const next: SuccessionChecklist = {
    ...checklist,
    updatedAt: new Date().toISOString(),
  };
  const sealed = await encryptJsonAtRest(next, dataKey);
  await putBlob(checklist.familyId, sealed);
  return next;
}
