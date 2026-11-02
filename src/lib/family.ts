/**
 * Helper inviti Famiglia (parse/encode QR) — persistenza via API account.
 */
import type { FamilyInvitePayload } from '@/types/account';

export function encodeInvitePayload(familyId: string, token: string): string {
  return `df1.${familyId}.${token}`;
}

export function parseInvitePayload(raw: string): FamilyInvitePayload | null {
  const trimmed = raw.trim();
  const hashMatch = trimmed.match(/[#?&]invite=([^&\s]+)/i);
  const candidate = hashMatch ? decodeURIComponent(hashMatch[1]!) : trimmed;
  const parts = candidate.split('.');
  if (parts.length !== 3 || parts[0] !== 'df1') return null;
  const familyId = parts[1]!;
  const token = parts[2]!;
  if (!familyId || !token) return null;
  return { familyId, token };
}

export function buildInviteUrl(origin: string, inviteCode: string): string {
  const base = origin.replace(/\/$/u, '');
  return `${base}/#invite=${inviteCode}`;
}

export function inviteCodeFromPayload(payload: FamilyInvitePayload): string {
  return encodeInvitePayload(payload.familyId, payload.token);
}
