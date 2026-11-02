/**
 * Gate auth comune alle route `/api/sync/*`: sessione + membership Famiglia + Premium sync.
 */

import {
  assertFamilyMember,
  getAccountById,
  getSession,
} from '@/lib/account-server';
import { readSessionToken } from '@/lib/session-cookie';
import { canAccessFeature, resolveEffectiveTier } from '@/lib/licensing';

export async function requireCloudSyncMember(familyId: string) {
  const token = await readSessionToken();
  const session = await getSession(token);
  if (!session) {
    throw Object.assign(new Error('Non autenticato'), { status: 401 });
  }
  const account = await getAccountById(session.accountId);
  if (!account) {
    throw Object.assign(new Error('Non autenticato'), { status: 401 });
  }
  await assertFamilyMember(familyId, account.accountId);
  const tier = resolveEffectiveTier(account.license);
  if (!canAccessFeature(tier, 'allowCloudSync')) {
    throw Object.assign(
      new Error(
        'Sync cloud riservata al piano Premium (o prova Premium attiva)'
      ),
      { status: 403 }
    );
  }
  return account;
}

export function errorStatus(error: unknown, fallback = 401): number {
  if (error && typeof error === 'object' && 'status' in error) {
    return Number((error as { status: number }).status);
  }
  return fallback;
}
