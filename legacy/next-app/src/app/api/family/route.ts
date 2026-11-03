import { NextResponse } from 'next/server';
import {
  createFamilyOnServer,
  getAccountById,
  getSession,
  saveAccount,
  toPublicAccount,
} from '@/lib/account-server';
import { readSessionToken } from '@/lib/session-cookie';

async function requireAccount() {
  const token = await readSessionToken();
  const session = await getSession(token);
  if (!session) return null;
  return getAccountById(session.accountId);
}

export async function POST(request: Request) {
  try {
    const account = await requireAccount();
    if (!account) {
      return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });
    }
    if (account.familyId) {
      return NextResponse.json(
        { error: 'Hai già una Famiglia' },
        { status: 400 }
      );
    }
    const body = (await request.json()) as { name?: string };
    const family = await createFamilyOnServer({
      name: body.name ?? '',
      ownerAccountId: account.accountId,
      ownerEmail: account.email,
      ownerDisplayName: account.displayName,
    });
    const next = {
      ...account,
      familyId: family.familyId,
      updatedAt: new Date().toISOString(),
    };
    await saveAccount(next);
    return NextResponse.json({
      family,
      account: toPublicAccount(next),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Creazione Famiglia non riuscita';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
