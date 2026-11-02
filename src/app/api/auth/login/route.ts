import { NextResponse } from 'next/server';
import {
  authenticateAccount,
  createSession,
  toPublicAccount,
} from '@/lib/account-server';
import { setSessionCookie } from '@/lib/session-cookie';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
    };
    if (!body.email || !body.password) {
      return NextResponse.json(
        { error: 'Email e password obbligatorie' },
        { status: 400 }
      );
    }
    const account = await authenticateAccount(body.email, body.password);
    const session = await createSession(account.accountId);
    await setSessionCookie(session.sessionToken);
    return NextResponse.json({
      account: toPublicAccount(account),
      expiresAt: session.expiresAt,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Accesso non riuscito';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
