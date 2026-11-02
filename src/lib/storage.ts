/**
 * Collezione case Famiglia — cifrata client-side, persistita sull'account server.
 * Nessun IndexedDB / localStorage come fonte di verità.
 */
import type { DomusRunbookDocument, LicenseTier } from '@/types/domus';
import { createEmptyRunbook } from '@/lib/defaults';
import { canAddHouse } from '@/lib/licensing';
import {
  decryptJsonAtRest,
  encryptJsonAtRest,
} from '@/lib/crypto-auth';

export interface DomusHouseCollection {
  version: '1.0.0';
  familyId?: string;
  activeDocumentId: string;
  houses: DomusRunbookDocument[];
}

export type StorageContext = {
  familyId: string;
  dataKey: CryptoKey;
  tier: LicenseTier;
};

function applyTier(
  document: DomusRunbookDocument,
  tier: LicenseTier
): DomusRunbookDocument {
  if (document.tier === tier) return document;
  return { ...document, tier };
}

function applyTierToCollection(
  collection: DomusHouseCollection,
  tier: LicenseTier
): DomusHouseCollection {
  return {
    ...collection,
    houses: collection.houses.map((h) => applyTier(h, tier)),
  };
}

function createFreshCollection(familyId: string): DomusHouseCollection {
  const house = createEmptyRunbook();
  return {
    version: '1.0.0',
    familyId,
    activeDocumentId: house.documentId,
    houses: [house],
  };
}

async function fetchHousesBlob(
  familyId: string
): Promise<{ ivBase64: string; ciphertextBase64: string } | null> {
  const res = await fetch(`/api/family/${familyId}/houses`);
  if (!res.ok) {
    throw new Error('Impossibile caricare le case della Famiglia');
  }
  const data = (await res.json()) as {
    blob: { ivBase64: string; ciphertextBase64: string } | null;
  };
  return data.blob;
}

async function putHousesBlob(
  familyId: string,
  sealed: { ivBase64: string; ciphertextBase64: string }
): Promise<void> {
  const res = await fetch(`/api/family/${familyId}/houses`, {
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
  if (!res.ok) {
    throw new Error('Salvataggio case non riuscito');
  }
}

async function persistEncrypted(
  collection: DomusHouseCollection,
  ctx: StorageContext
): Promise<void> {
  const sealed = await encryptJsonAtRest(collection, ctx.dataKey);
  await putHousesBlob(ctx.familyId, sealed);
}

export async function loadHouseCollection(
  ctx: StorageContext
): Promise<DomusHouseCollection> {
  const blob = await fetchHousesBlob(ctx.familyId);
  if (!blob) {
    const fresh = applyTierToCollection(
      createFreshCollection(ctx.familyId),
      ctx.tier
    );
    await persistEncrypted(fresh, ctx);
    return fresh;
  }

  const stored = await decryptJsonAtRest<DomusHouseCollection>(
    blob,
    ctx.dataKey
  );
  if (
    stored.version !== '1.0.0' ||
    !Array.isArray(stored.houses) ||
    stored.houses.length === 0
  ) {
    const fresh = applyTierToCollection(
      createFreshCollection(ctx.familyId),
      ctx.tier
    );
    await persistEncrypted(fresh, ctx);
    return fresh;
  }

  const next = applyTierToCollection(
    { ...stored, familyId: ctx.familyId },
    ctx.tier
  );
  const activeExists = next.houses.some(
    (h) => h.documentId === next.activeDocumentId
  );
  if (!activeExists) {
    next.activeDocumentId = next.houses[0]!.documentId;
  }
  return next;
}

export function getActiveHouse(
  collection: DomusHouseCollection
): DomusRunbookDocument {
  const active = collection.houses.find(
    (h) => h.documentId === collection.activeDocumentId
  );
  return active ?? collection.houses[0]!;
}

export async function loadRunbook(
  ctx: StorageContext
): Promise<DomusRunbookDocument> {
  return getActiveHouse(await loadHouseCollection(ctx));
}

export async function saveRunbook(
  document: DomusRunbookDocument,
  ctx: StorageContext
): Promise<DomusRunbookDocument> {
  const collection = await loadHouseCollection(ctx);
  const nextDoc: DomusRunbookDocument = {
    ...document,
    tier: ctx.tier,
    updatedAt: new Date().toISOString(),
  };
  const houses = collection.houses.map((h) =>
    h.documentId === nextDoc.documentId ? nextDoc : h
  );
  const hasDoc = houses.some((h) => h.documentId === nextDoc.documentId);
  const next: DomusHouseCollection = {
    version: '1.0.0',
    familyId: ctx.familyId,
    activeDocumentId: nextDoc.documentId,
    houses: hasDoc ? houses : [...houses, nextDoc],
  };
  await persistEncrypted(next, ctx);
  return nextDoc;
}

export async function addHouse(
  ctx: StorageContext
): Promise<DomusHouseCollection | null> {
  const collection = await loadHouseCollection(ctx);
  if (!canAddHouse(ctx.tier, collection.houses.length)) return null;
  const house = applyTier(createEmptyRunbook(), ctx.tier);
  const next: DomusHouseCollection = {
    version: '1.0.0',
    familyId: ctx.familyId,
    activeDocumentId: house.documentId,
    houses: [...collection.houses, house],
  };
  await persistEncrypted(next, ctx);
  return next;
}

export async function switchActiveHouse(
  documentId: string,
  ctx: StorageContext
): Promise<DomusHouseCollection | null> {
  const collection = await loadHouseCollection(ctx);
  if (!collection.houses.some((h) => h.documentId === documentId)) return null;
  const next: DomusHouseCollection = {
    ...collection,
    familyId: ctx.familyId,
    activeDocumentId: documentId,
  };
  await persistEncrypted(next, ctx);
  return next;
}

export async function removeHouse(
  documentId: string,
  ctx: StorageContext
): Promise<DomusHouseCollection | null> {
  const collection = await loadHouseCollection(ctx);
  if (collection.houses.length <= 1) return null;
  const houses = collection.houses.filter((h) => h.documentId !== documentId);
  if (houses.length === collection.houses.length) return null;
  const activeDocumentId =
    collection.activeDocumentId === documentId
      ? houses[0]!.documentId
      : collection.activeDocumentId;
  const next: DomusHouseCollection = {
    version: '1.0.0',
    familyId: ctx.familyId,
    activeDocumentId,
    houses,
  };
  await persistEncrypted(next, ctx);
  return next;
}

export async function replaceHouseCollection(
  collection: DomusHouseCollection,
  ctx: StorageContext
): Promise<DomusHouseCollection> {
  if (
    collection.version !== '1.0.0' ||
    !Array.isArray(collection.houses) ||
    collection.houses.length === 0
  ) {
    throw new Error('Collezione sync non valida');
  }
  const next = applyTierToCollection(
    {
      version: '1.0.0',
      familyId: ctx.familyId,
      activeDocumentId: collection.activeDocumentId,
      houses: collection.houses,
    },
    ctx.tier
  );
  if (!next.houses.some((h) => h.documentId === next.activeDocumentId)) {
    next.activeDocumentId = next.houses[0]!.documentId;
  }
  await persistEncrypted(next, ctx);
  return next;
}
