import { NextResponse } from 'next/server';
import {
  getAccountById,
  getSession,
  saveAccount,
  toPublicAccount,
} from '@/lib/account-server';
import { readSessionToken } from '@/lib/session-cookie';
import { isThemePreference } from '@/lib/theme';

/**
 * Preferenze account (tema Material chiaro/scuro/sistema).
 * Persistenza filesystem account — non IndexedDB.
 */
export async function PUT(request: Request) {
  const token = await readSessionToken();
  const session = await getSession(token);
  if (!session) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });
  }
  const account = await getAccountById(session.accountId);
  if (!account) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });
  }

  let body: { themePreference?: unknown };
  try {
    body = (await request.json()) as { themePreference?: unknown };
  } catch {
    return NextResponse.json({ error: 'Corpo non valido' }, { status: 400 });
  }

  if (!isThemePreference(body.themePreference)) {
    return NextResponse.json(
      { error: 'Tema non valido (light, dark o system)' },
      { status: 400 }
    );
  }

  const next = {
    ...account,
    themePreference: body.themePreference,
    updatedAt: new Date().toISOString(),
  };
  await saveAccount(next);
  return NextResponse.json({ account: toPublicAccount(next) });
}
