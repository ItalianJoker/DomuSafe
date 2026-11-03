import { NextResponse } from 'next/server';
import { destroySession } from '@/lib/account-server';
import {
  clearSessionCookie,
  readSessionToken,
} from '@/lib/session-cookie';

export async function POST() {
  const token = await readSessionToken();
  if (token) await destroySession(token);
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
