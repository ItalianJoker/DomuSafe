/**
 * Compat: logout via DELETE; stato via GET.
 * Login/register impostano già il cookie httpOnly.
 */
import { NextResponse } from 'next/server';
import { destroySession, getSession } from '@/lib/account-server';
import {
  clearSessionCookie,
  readSessionToken,
} from '@/lib/session-cookie';

export async function GET() {
  const token = await readSessionToken();
  const session = await getSession(token);
  if (!session) {
    return NextResponse.json({ authenticated: false });
  }
  return NextResponse.json({
    authenticated: true,
    accountId: session.accountId,
  });
}

export async function DELETE() {
  const token = await readSessionToken();
  if (token) await destroySession(token);
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}

/** POST legacy no-op: la sessione nasce da /login|/register. */
export async function POST() {
  return NextResponse.json({ ok: true });
}
