import { NextResponse } from 'next/server';
import {
  createSession,
  registerAccount,
  toPublicAccount,
} from '@/lib/account-server';
import { setSessionCookie } from '@/lib/session-cookie';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
      displayName?: string;
      dataKeySaltBase64?: string;
      wrappedDataKeyBase64?: string;
      wrappedDataKeyIvBase64?: string;
    };
    if (
      !body.email ||
      !body.password ||
      !body.dataKeySaltBase64 ||
      !body.wrappedDataKeyBase64 ||
      !body.wrappedDataKeyIvBase64
    ) {
      return NextResponse.json(
        { error: 'Dati di registrazione incompleti' },
        { status: 400 }
      );
    }
    const account = await registerAccount({
      email: body.email,
      password: body.password,
      displayName: body.displayName ?? '',
      dataKeySaltBase64: body.dataKeySaltBase64,
      wrappedDataKeyBase64: body.wrappedDataKeyBase64,
      wrappedDataKeyIvBase64: body.wrappedDataKeyIvBase64,
    });
    const session = await createSession(account.accountId);
    await setSessionCookie(session.sessionToken);
    return NextResponse.json({
      account: toPublicAccount(account),
      expiresAt: session.expiresAt,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Registrazione non riuscita';
    const status = message.includes('Esiste già') ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
