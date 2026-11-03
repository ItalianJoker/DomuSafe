import { NextResponse } from 'next/server';
import {
  getAccountById,
  getFamily,
  getSession,
  toPublicAccount,
} from '@/lib/account-server';
import { readSessionToken } from '@/lib/session-cookie';

export async function GET() {
  const token = await readSessionToken();
  const session = await getSession(token);
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  const account = await getAccountById(session.accountId);
  if (!account) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  const family = account.familyId
    ? await getFamily(account.familyId)
    : null;
  return NextResponse.json({
    authenticated: true,
    account: toPublicAccount(account),
    family,
    expiresAt: session.expiresAt,
  });
}
