/**
 * Client auth DomuSafe — API account server, nessuna persistenza browser durevole.
 * Account data-key + family-key solo in memoria di processo.
 */
import type { DomuAccount, DomuFamily, SealedKeyBlob } from '@/types/account';
import {
  prepareRegistrationCrypto,
  unlockDataKeyFromAccount,
} from '@/lib/crypto-auth';
import {
  createFamilyKey,
  importFamilyKey,
  openFamilyKeyFromInvite,
  sealFamilyKeyForInvite,
  unwrapFamilyKeyForMember,
  wrapFamilyKeyForMember,
} from '@/lib/crypto-family';
import { parseInvitePayload } from '@/lib/family';
/** Memoria di processo: data-key per accountId. */
const unlockedDataKeys = new Map<string, CryptoKey>();
/** Family-key per familyId (workspace condiviso). */
const unlockedFamilyKeys = new Map<string, CryptoKey>();
/** Raw family-key (per seal inviti) — solo memoria. */
const familyKeyRaws = new Map<string, Uint8Array>();

export function getUnlockedDataKey(accountId: string): CryptoKey | null {
  return unlockedDataKeys.get(accountId) ?? null;
}

export function setUnlockedDataKey(
  accountId: string,
  key: CryptoKey
): void {
  unlockedDataKeys.set(accountId, key);
}

export function clearUnlockedDataKey(accountId?: string): void {
  if (accountId) unlockedDataKeys.delete(accountId);
  else unlockedDataKeys.clear();
}

export function getUnlockedFamilyKey(familyId: string): CryptoKey | null {
  return unlockedFamilyKeys.get(familyId) ?? null;
}

export function getFamilyKeyRaw(familyId: string): Uint8Array | null {
  return familyKeyRaws.get(familyId) ?? null;
}

function setFamilyKeyMemory(
  familyId: string,
  key: CryptoKey,
  raw: Uint8Array
): void {
  unlockedFamilyKeys.set(familyId, key);
  familyKeyRaws.set(familyId, raw);
}

export function clearFamilyKeyMemory(familyId?: string): void {
  if (familyId) {
    unlockedFamilyKeys.delete(familyId);
    familyKeyRaws.delete(familyId);
  } else {
    unlockedFamilyKeys.clear();
    familyKeyRaws.clear();
  }
}

async function parseError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error || `Errore ${res.status}`;
  } catch {
    return `Errore ${res.status}`;
  }
}

async function putMemberKeyWrap(
  familyId: string,
  wrap: SealedKeyBlob
): Promise<DomuFamily> {
  const res = await fetch(`/api/family/${familyId}/key-wrap`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wrap }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { family: DomuFamily };
  return data.family;
}

/**
 * Sblocca o crea la family-key per l’account corrente.
 * Legacy (nessun wrap): genera nuova key, il chiamante migra i blob.
 */
export async function ensureFamilyKeyForSession(input: {
  family: DomuFamily;
  accountId: string;
  accountDataKey: CryptoKey;
}): Promise<{
  familyKey: CryptoKey;
  familyKeyRaw: Uint8Array;
  family: DomuFamily;
  createdNew: boolean;
}> {
  const cached = getUnlockedFamilyKey(input.family.familyId);
  const cachedRaw = getFamilyKeyRaw(input.family.familyId);
  if (cached && cachedRaw) {
    return {
      familyKey: cached,
      familyKeyRaw: cachedRaw,
      family: input.family,
      createdNew: false,
    };
  }

  const existing = input.family.memberKeyWraps?.[input.accountId];
  if (existing) {
    const raw = await unwrapFamilyKeyForMember(existing, input.accountDataKey);
    const key = await importFamilyKey(raw);
    setFamilyKeyMemory(input.family.familyId, key, raw);
    return {
      familyKey: key,
      familyKeyRaw: raw,
      family: input.family,
      createdNew: false,
    };
  }

  const { key, raw } = await createFamilyKey();
  const wrap = await wrapFamilyKeyForMember(raw, input.accountDataKey);
  const family = await putMemberKeyWrap(input.family.familyId, wrap);
  setFamilyKeyMemory(input.family.familyId, key, raw);
  return {
    familyKey: key,
    familyKeyRaw: raw,
    family,
    createdNew: true,
  };
}

export async function registerAccount(input: {
  email: string;
  password: string;
  displayName: string;
}): Promise<{ account: DomuAccount; dataKey: CryptoKey }> {
  const cryptoMaterial = await prepareRegistrationCrypto(input.password);
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      displayName: input.displayName,
      dataKeySaltBase64: cryptoMaterial.dataKeySaltBase64,
      wrappedDataKeyBase64: cryptoMaterial.wrappedDataKeyBase64,
      wrappedDataKeyIvBase64: cryptoMaterial.wrappedDataKeyIvBase64,
    }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { account: DomuAccount };
  setUnlockedDataKey(data.account.accountId, cryptoMaterial.dataKey);
  return { account: data.account, dataKey: cryptoMaterial.dataKey };
}

export async function loginAccount(input: {
  email: string;
  password: string;
}): Promise<{ account: DomuAccount; dataKey: CryptoKey }> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { account: DomuAccount };
  const dataKey = await unlockDataKeyFromAccount(input.password, data.account);
  setUnlockedDataKey(data.account.accountId, dataKey);
  return { account: data.account, dataKey };
}

export async function fetchSession(): Promise<{
  account: DomuAccount;
  family: DomuFamily | null;
} | null> {
  const res = await fetch('/api/auth/me', { method: 'GET' });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as {
    account: DomuAccount;
    family: DomuFamily | null;
  };
  return { account: data.account, family: data.family };
}

export async function logoutAccount(): Promise<void> {
  clearUnlockedDataKey();
  clearFamilyKeyMemory();
  await fetch('/api/auth/logout', { method: 'POST' });
}

export async function unlockWithPassword(
  account: DomuAccount,
  password: string
): Promise<CryptoKey> {
  const dataKey = await unlockDataKeyFromAccount(password, account);
  setUnlockedDataKey(account.accountId, dataKey);
  return dataKey;
}

export async function createFamilyApi(
  name: string,
  accountDataKey: CryptoKey,
  accountId: string
): Promise<{
  family: DomuFamily;
  account: DomuAccount;
  familyKey: CryptoKey;
}> {
  const res = await fetch('/api/family', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const created = (await res.json()) as {
    family: DomuFamily;
    account: DomuAccount;
  };
  const { key, raw } = await createFamilyKey();
  const wrap = await wrapFamilyKeyForMember(raw, accountDataKey);
  const family = await putMemberKeyWrap(created.family.familyId, wrap);
  setFamilyKeyMemory(family.familyId, key, raw);
  void accountId;
  return { family, account: created.account, familyKey: key };
}

export async function joinFamilyApi(
  inviteCode: string,
  accountDataKey: CryptoKey
): Promise<{
  family: DomuFamily;
  account: DomuAccount;
  familyKey: CryptoKey;
}> {
  const res = await fetch('/api/family/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inviteCode }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as {
    family: DomuFamily;
    account: DomuAccount;
    sealedFamilyKey: SealedKeyBlob;
    inviteToken: string;
    familyId: string;
  };
  const raw = await openFamilyKeyFromInvite(
    data.sealedFamilyKey,
    data.inviteToken,
    data.familyId
  );
  const key = await importFamilyKey(raw);
  const wrap = await wrapFamilyKeyForMember(raw, accountDataKey);
  const family = await putMemberKeyWrap(data.familyId, wrap);
  setFamilyKeyMemory(data.familyId, key, raw);
  return { family, account: data.account, familyKey: key };
}

export async function createInviteApi(
  familyId: string,
  familyKeyRaw: Uint8Array
): Promise<{
  family: DomuFamily;
  inviteCode: string;
}> {
  /** Token opaco client-side (hex 32) — consente seal family-key prima del POST. */
  const tokenBytes = crypto.getRandomValues(new Uint8Array(16));
  const clientToken = Array.from(tokenBytes, (b) =>
    b.toString(16).padStart(2, '0')
  ).join('');
  const sealedFamilyKey = await sealFamilyKeyForInvite(
    familyKeyRaw,
    clientToken,
    familyId
  );
  const res = await fetch('/api/family/invite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sealedFamilyKey, clientToken }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as { family: DomuFamily; inviteCode: string };
}

export async function markTutorialCompletedApi(): Promise<DomuAccount> {
  const res = await fetch('/api/account/tutorial', { method: 'POST' });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { account: DomuAccount };
  return data.account;
}

/** Avvia prova Premium — il server applica startPremiumTrial (no spoof). */
export async function startPremiumTrialApi(): Promise<DomuAccount> {
  const res = await fetch('/api/account/license', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'start_premium_trial' }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { account: DomuAccount };
  return data.account;
}

/** @deprecated use startPremiumTrialApi */
export async function updateLicenseApi(): Promise<DomuAccount> {
  return startPremiumTrialApi();
}

export { parseInvitePayload };
