import { NextResponse } from 'next/server';
import {
  getAccountById,
  getSession,
  saveAccount,
  toPublicAccount,
} from '@/lib/account-server';
import { readSessionToken } from '@/lib/session-cookie';

export async function POST() {
  const token = await readSessionToken();
  const session = await getSession(token);
  if (!session) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });
  }
  const account = await getAccountById(session.accountId);
  if (!account) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });
  }
  const next = {
    ...account,
    tutorialCompleted: true,
    updatedAt: new Date().toISOString(),
  };
  await saveAccount(next);
  return NextResponse.json({ account: toPublicAccount(next) });
}
