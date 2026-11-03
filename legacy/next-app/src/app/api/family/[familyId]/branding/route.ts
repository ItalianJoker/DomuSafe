/**
 * White-label branding Famiglia — Premium (customBranding).
 */
import { NextResponse } from 'next/server';
import {
  assertFamilyMember,
  getAccountById,
  getFamily,
  getSession,
  updateFamilyBranding,
} from '@/lib/account-server';
import { readSessionToken } from '@/lib/session-cookie';
import {
  PREMIUM_REQUIRED_MESSAGE,
  accountCanAccess,
} from '@/lib/premium-gate';
import type { FamilyBranding } from '@/types/premium';

type Ctx = { params: Promise<{ familyId: string }> };

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
/** Limite logo data-URL (~48KB) — zero-bloat, niente storage pesante. */
const MAX_LOGO_DATA_URL = 48_000;

async function requirePremiumMember(familyId: string) {
  const token = await readSessionToken();
  const session = await getSession(token);
  if (!session) return null;
  const account = await getAccountById(session.accountId);
  if (!account) return null;
  await assertFamilyMember(familyId, account.accountId);
  if (!accountCanAccess(account.license, 'customBranding')) {
    throw new Error(PREMIUM_REQUIRED_MESSAGE);
  }
  return account;
}

function sanitizeBranding(raw: Partial<FamilyBranding>): FamilyBranding {
  const hostDisplayName = (raw.hostDisplayName ?? '').trim().slice(0, 80);
  if (!hostDisplayName) {
    throw new Error('Inserisci un nome host / struttura');
  }
  const accentColor = (raw.accentColor ?? '#0b1f17').trim();
  if (!HEX_COLOR.test(accentColor)) {
    throw new Error('Colore non valido (usa #RRGGBB)');
  }
  let logoDataUrl = raw.logoDataUrl?.trim();
  if (logoDataUrl) {
    if (
      !logoDataUrl.startsWith('data:image/') ||
      logoDataUrl.length > MAX_LOGO_DATA_URL
    ) {
      throw new Error(
        'Logo troppo grande o non valido (solo immagine data-URL piccola)'
      );
    }
  } else {
    logoDataUrl = undefined;
  }
  const tagline = raw.tagline?.trim().slice(0, 120) || undefined;
  return { hostDisplayName, accentColor, logoDataUrl, tagline };
}

export async function GET(_request: Request, context: Ctx) {
  try {
    const { familyId } = await context.params;
    const account = await requirePremiumMember(familyId);
    if (!account) {
      return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });
    }
    const family = await getFamily(familyId);
    return NextResponse.json({ branding: family?.branding ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Errore';
    const status = message.includes('Premium') || message.includes('Accesso')
      ? 403
      : 401;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(request: Request, context: Ctx) {
  try {
    const { familyId } = await context.params;
    const account = await requirePremiumMember(familyId);
    if (!account) {
      return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });
    }
    const body = (await request.json()) as {
      branding?: Partial<FamilyBranding> | null;
    };
    if (body.branding === null) {
      const family = await updateFamilyBranding(familyId, null);
      return NextResponse.json({ ok: true, branding: family.branding ?? null });
    }
    const branding = sanitizeBranding(body.branding ?? {});
    const family = await updateFamilyBranding(familyId, branding);
    return NextResponse.json({ ok: true, branding: family.branding ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Errore';
    const status =
      message.includes('Premium') || message.includes('Accesso')
        ? 403
        : message.includes('non valido') ||
            message.includes('Inserisci') ||
            message.includes('troppo')
          ? 400
          : 401;
    return NextResponse.json({ error: message }, { status });
  }
}
