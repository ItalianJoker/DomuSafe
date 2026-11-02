import { NextResponse } from 'next/server';
import {
  getAccountById,
  getSession,
  saveAccount,
  toPublicAccount,
} from '@/lib/account-server';
import { readSessionToken } from '@/lib/session-cookie';
import { startPremiumTrial } from '@/lib/trial';

/**
 * Unica mutazione licenza consentita dal client: avvio prova Premium.
 * Non accetta `baseTier` / campi trial arbitrari (anti-spoof Feature Gate).
 */
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
    const body = (await request.json()) as { action?: string };
    if (body.action !== 'start_premium_trial') {
      return NextResponse.json(
        { error: 'Azione licenza non consentita' },
        { status: 400 }
      );
    }
    const license = startPremiumTrial(account.license);
    const next = {
      ...account,
      license,
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
