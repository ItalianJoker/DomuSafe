import { NextResponse } from 'next/server';
import {
  getAccountById,
  getSession,
  saveAccount,
  toPublicAccount,
} from '@/lib/account-server';
import type { AccountLicenseState } from '@/types/account';
import { readSessionToken } from '@/lib/session-cookie';

export async function PUT(request: Request) {
  try {
    const token = await readSessionToken();
    const session = await getSession(token);
    if (!session) {
      return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });
    }
    const account = await getAccountById(session.accountId);
    if (!account) {
      return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });
    }
    const body = (await request.json()) as { license?: AccountLicenseState };
    if (!body.license) {
      return NextResponse.json({ error: 'Licenza mancante' }, { status: 400 });
    }
    const next = {
      ...account,
      license: body.license,
      updatedAt: new Date().toISOString(),
    };
    await saveAccount(next);
    return NextResponse.json({ account: toPublicAccount(next) });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Aggiornamento licenza fallito';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
