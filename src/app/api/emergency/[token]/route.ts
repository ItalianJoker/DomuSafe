/**
 * Lettura pubblica pacchetto break-glass (ciphertext only).
 * Nessun login. Audit BREAK_GLASS al primo GET (metadati, non plaintext).
 */
import { NextResponse } from 'next/server';
import {
  appendAuditEntry,
  findFamilyByEmergencyToken,
  hashIpForAudit,
  readEmergencyBlob,
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
    const family = await findFamilyByEmergencyToken(token);
    if (!family) {
      return NextResponse.json(
        { error: 'QR emergenza non valido' },
        { status: 404 }
      );
    }
    const blob = await readEmergencyBlob(family.familyId);
    if (!blob) {
      return NextResponse.json(
        { error: 'Pacchetto emergenza non pubblicato' },
        { status: 404 }
      );
    }

    const url = new URL(request.url);
    const ack = url.searchParams.get('ack') !== '0';
    if (ack) {
      await appendAuditEntry(family.familyId, {
        kind: 'BREAK_GLASS',
        actorLabel: `Break-glass · ${shortUa(request)}`,
        note: 'Consultazione L1/L2 senza login',
        ipHash: hashIpForAudit(clientIp(request)),
      });
    }

    return NextResponse.json({
      ok: true,
      familyName: family.name,
      blob: {
        ivBase64: blob.ivBase64,
        ciphertextBase64: blob.ciphertextBase64,
      },
      branding: family.branding
        ? {
            hostDisplayName: family.branding.hostDisplayName,
            accentColor: family.branding.accentColor,
            tagline: family.branding.tagline,
          }
        : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Errore';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
