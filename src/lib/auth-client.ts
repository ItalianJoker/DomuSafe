/**
 * Client auth DomuSafe — API account server, nessuna persistenza browser durevole.
 * La data-key sbloccata vive solo in memoria di processo.
 */
import type { DomuAccount, DomuFamily } from '@/types/account';
import {
  prepareRegistrationCrypto,
  unlockDataKeyFromAccount,
} from '@/lib/crypto-auth';

/** Memoria di processo: data-key per accountId. */
const unlockedDataKeys = new Map<string, CryptoKey>();

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

async function parseError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error || `Errore ${res.status}`;
  } catch {
    return `Errore ${res.status}`;
  }
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

export async function createFamilyApi(name: string): Promise<{
  family: DomuFamily;
  account: DomuAccount;
}> {
  const res = await fetch('/api/family', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as { family: DomuFamily; account: DomuAccount };
}

export async function joinFamilyApi(inviteCode: string): Promise<{
  family: DomuFamily;
  account: DomuAccount;
}> {
  const res = await fetch('/api/family/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inviteCode }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as { family: DomuFamily; account: DomuAccount };
}

export async function createInviteApi(): Promise<{
  family: DomuFamily;
  inviteCode: string;
}> {
  const res = await fetch('/api/family/invite', { method: 'POST' });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as { family: DomuFamily; inviteCode: string };
}

export async function markTutorialCompletedApi(): Promise<DomuAccount> {
  const res = await fetch('/api/account/tutorial', { method: 'POST' });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { account: DomuAccount };
  return data.account;
}

/** Avvia prova Premium 30 giorni (logica trial solo sul server). */
export async function startTrialApi(): Promise<DomuAccount> {
  const res = await fetch('/api/account/license', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'start_trial' }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { account: DomuAccount };
  return data.account;
}

/** Applica chiave JWT/Ed25519 SaaS verificata sul server. */
export async function applySaasLicenseApi(
  saasToken: string
): Promise<DomuAccount> {
  const res = await fetch('/api/account/license', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'apply_saas', saasToken }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { account: DomuAccount };
  return data.account;
}

