/**
 * Beacon pubblico scan QR — registra accesso Premium audit log.
 * Nessuna autenticazione: solo token Famiglia. Non espone dati ICE/vault.
 */
import { NextResponse } from 'next/server';
import {
  appendAuditEntry,
  findFamilyByScanToken,
  hashIpForAudit,
} from '@/lib/account-server';

type Ctx = { params: Promise<{ token: string }> };

function clientIp(request: Request): string | undefined {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]?.trim();
  return undefined;
}

function shortUa(request: Request): string {
  const ua = request.headers.get('user-agent') ?? 'dispositivo';
  return ua.slice(0, 80);
}

export async function GET(request: Request, context: Ctx) {
  try {
    const { token } = await context.params;
    const family = await findFamilyByScanToken(token);
    if (!family) {
      return NextResponse.json(
        { error: 'QR non valido o scaduto' },
        { status: 404 }
      );
    }

    const url = new URL(request.url);
    const houseName = url.searchParams.get('house')?.slice(0, 120) || undefined;

    await appendAuditEntry(family.familyId, {
      kind: 'SCAN',
      actorLabel: `Ospite · ${shortUa(request)}`,
      houseName,
      note: 'Scansione QR di monitoraggio',
      ipHash: hashIpForAudit(clientIp(request)),
    });

    return NextResponse.json({
      ok: true,
      familyName: family.name,
      hostDisplayName: family.branding?.hostDisplayName ?? null,
      tagline: family.branding?.tagline ?? null,
      accentColor: family.branding?.accentColor ?? null,
      message:
        'Accesso registrato. Contatta l’host se ti serve il manuale completo.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Errore';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request, context: Ctx) {
  return GET(request, context);
}