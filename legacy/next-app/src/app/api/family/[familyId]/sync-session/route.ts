/**
 * Sessione sync E2EE per account entro la Famiglia.
 * Persistenza Postgres (`family_blobs`, kind syncsession:<accountId>).
 * Blob già cifrato con data-key account (client).
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import {
  assertFamilyMember,
  getAccountById,
  getSession,
  type EncryptedAccountBlob,
} from '@/lib/account-server';
import { readSessionToken } from '@/lib/session-cookie';
import { ensureDbSchema, getDb } from '@/db/client';
import { familyBlobs } from '@/db/schema';

type Ctx = { params: Promise<{ familyId: string }> };

function syncSessionKind(accountId: string): string {
  return `syncsession:${accountId}`;
}

async function requireMember(familyId: string) {
  const token = await readSessionToken();
  const session = await getSession(token);
  if (!session) return null;
  const account = await getAccountById(session.accountId);
  if (!account) return null;
  await assertFamilyMember(familyId, account.accountId);
  return account;
}

export async function GET(_request: Request, context: Ctx) {
  try {
    const { familyId } = await context.params;
    const account = await requireMember(familyId);
    if (!account) {
      return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });
    }
    await ensureDbSchema();
    const rows = await getDb()
      .select()
      .from(familyBlobs)
      .where(
        and(
          eq(familyBlobs.familyId, familyId),
          eq(familyBlobs.kind, syncSessionKind(account.accountId))
        )
      )
      .limit(1);
    const row = rows[0];
    if (!row) {
      return NextResponse.json({ blob: null });
    }
    const blob: EncryptedAccountBlob = {
      version: 'enc-1',
      ivBase64: row.ivBase64,
      ciphertextBase64: row.ciphertextBase64,
      updatedAt: row.updatedAt,
    };
    return NextResponse.json({ blob });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Errore';
    const status = message.includes('Accesso') ? 403 : 401;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(request: Request, context: Ctx) {
  try {
    const { familyId } = await context.params;
    const account = await requireMember(familyId);
    if (!account) {
      return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });
    }
    const body = (await request.json()) as { blob?: EncryptedAccountBlob };
    if (
      !body.blob ||
      body.blob.version !== 'enc-1' ||
      !body.blob.ivBase64 ||
      !body.blob.ciphertextBase64
    ) {
      return NextResponse.json(
        { error: 'Envelope cifrato non valido' },
        { status: 400 }
      );
    }
    const updatedAt = new Date().toISOString();
    const blob: EncryptedAccountBlob = {
      ...body.blob,
      updatedAt,
    };
    await ensureDbSchema();
    await getDb()
      .insert(familyBlobs)
      .values({
        familyId,
        kind: syncSessionKind(account.accountId),
        version: 'enc-1',
        ivBase64: blob.ivBase64,
        ciphertextBase64: blob.ciphertextBase64,
        updatedAt,
      })
      .onConflictDoUpdate({
        target: [familyBlobs.familyId, familyBlobs.kind],
        set: {
          ivBase64: blob.ivBase64,
          ciphertextBase64: blob.ciphertextBase64,
          updatedAt,
        },
      });
    return NextResponse.json({ ok: true, blob });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Errore';
    const status = message.includes('Accesso') ? 403 : 401;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(_request: Request, context: Ctx) {
  try {
    const { familyId } = await context.params;
    const account = await requireMember(familyId);
    if (!account) {
      return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });
    }
    await ensureDbSchema();
    await getDb()
      .delete(familyBlobs)
      .where(
        and(
          eq(familyBlobs.familyId, familyId),
          eq(familyBlobs.kind, syncSessionKind(account.accountId))
        )
      );
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Errore';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
