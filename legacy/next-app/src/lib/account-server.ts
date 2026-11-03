/**
 * Store account/Famiglia SaaS (Postgres) — unica fonte di verità.
 * Zero filesystem/`DOMUSAFE_DATA_DIR` come SoT. Blob sensibili: solo ciphertext.
 *
 * Connessione: `DATABASE_URL` (vedi docker-compose / README).
 */

import { createHash, randomBytes, pbkdf2Sync, timingSafeEqual } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type {
  AccountLicenseState,
  DomuFamily,
  FamilyInvite,
  FamilyMember,
  SealedKeyBlob,
} from '@/types/account';
import type { AuditLogDocument, AuditLogEntry, FamilyBranding } from '@/types/premium';
import { createInitialLicense } from '@/lib/trial';
import { resolveConfiguredTier } from '@/lib/licensing';
import { ensureDbSchema, getDb, resetDatabaseForTests } from '@/db/client';
import {
  accounts,
  auditLogs,
  families,
  familyBlobs,
  sessions,
} from '@/db/schema';

/** Cap audit log: evita crescita illimitata. */
const AUDIT_LOG_MAX_ENTRIES = 500;

const PBKDF2_ITERATIONS = 100_000;
const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export interface ServerAccount {
  version: '1.0.0';
  accountId: string;
  email: string;
  displayName: string;
  passwordSaltHex: string;
  passwordHashHex: string;
  dataKeySaltBase64: string;
  wrappedDataKeyBase64: string;
  wrappedDataKeyIvBase64: string;
  familyId: string | null;
  license: AccountLicenseState;
  tutorialCompleted: boolean;
  themePreference?: 'light' | 'dark' | 'system';
  createdAt: string;
  updatedAt: string;
}

/** Envelope cifrato client (case o successione) — server non decifra. */
export interface EncryptedAccountBlob {
  version: 'enc-1';
  ivBase64: string;
  ciphertextBase64: string;
  updatedAt: string;
}

interface SessionRecord {
  sessionToken: string;
  accountId: string;
  createdAt: string;
  expiresAt: string;
}

type BlobKind = 'houses' | 'succession' | 'emergency';

function createId(): string {
  return randomBytes(16).toString('hex');
}

function hashPassword(password: string, saltHex: string): string {
  return pbkdf2Sync(
    password,
    Buffer.from(saltHex, 'hex'),
    PBKDF2_ITERATIONS,
    32,
    'sha256'
  ).toString('hex');
}

function verifyPassword(
  password: string,
  saltHex: string,
  hashHex: string
): boolean {
  const a = Buffer.from(hashPassword(password, saltHex), 'hex');
  const b = Buffer.from(hashHex, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function rowToAccount(row: typeof accounts.$inferSelect): ServerAccount {
  return {
    version: '1.0.0',
    accountId: row.accountId,
    email: row.email,
    displayName: row.displayName,
    passwordSaltHex: row.passwordSaltHex,
    passwordHashHex: row.passwordHashHex,
    dataKeySaltBase64: row.dataKeySaltBase64,
    wrappedDataKeyBase64: row.wrappedDataKeyBase64,
    wrappedDataKeyIvBase64: row.wrappedDataKeyIvBase64,
    familyId: row.familyId,
    license: row.license as AccountLicenseState,
    tutorialCompleted: row.tutorialCompleted,
    themePreference: (row.themePreference as ServerAccount['themePreference']) ?? 'system',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** @deprecated filesystem path — no-op; schema DB. */
export async function ensureAppDataDirs(): Promise<void> {
  await ensureDbSchema();
}

/** @deprecated — DB URL replaces data dir. Kept for smoke compatibility. */
export function getAppDataDir(): string {
  return process.env.DATABASE_URL?.trim()
    ? 'postgres://(DATABASE_URL)'
    : '(DATABASE_URL missing)';
}

export async function findAccountByEmail(
  email: string
): Promise<ServerAccount | null> {
  await ensureDbSchema();
  const normalized = email.trim().toLowerCase();
  const rows = await getDb()
    .select()
    .from(accounts)
    .where(eq(accounts.email, normalized))
    .limit(1);
  const row = rows[0];
  return row ? rowToAccount(row) : null;
}

export async function getAccountById(
  accountId: string
): Promise<ServerAccount | null> {
  await ensureDbSchema();
  const rows = await getDb()
    .select()
    .from(accounts)
    .where(eq(accounts.accountId, accountId))
    .limit(1);
  const row = rows[0];
  return row ? rowToAccount(row) : null;
}

export async function saveAccount(account: ServerAccount): Promise<void> {
  await ensureDbSchema();
  const db = getDb();
  const values = {
    accountId: account.accountId,
    email: account.email,
    displayName: account.displayName,
    passwordSaltHex: account.passwordSaltHex,
    passwordHashHex: account.passwordHashHex,
    dataKeySaltBase64: account.dataKeySaltBase64,
    wrappedDataKeyBase64: account.wrappedDataKeyBase64,
    wrappedDataKeyIvBase64: account.wrappedDataKeyIvBase64,
    familyId: account.familyId,
    license: account.license,
    tutorialCompleted: account.tutorialCompleted,
    themePreference: account.themePreference ?? 'system',
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
  await db
    .insert(accounts)
    .values(values)
    .onConflictDoUpdate({
      target: accounts.accountId,
      set: {
        email: values.email,
        displayName: values.displayName,
        passwordSaltHex: values.passwordSaltHex,
        passwordHashHex: values.passwordHashHex,
        dataKeySaltBase64: values.dataKeySaltBase64,
        wrappedDataKeyBase64: values.wrappedDataKeyBase64,
        wrappedDataKeyIvBase64: values.wrappedDataKeyIvBase64,
        familyId: values.familyId,
        license: values.license,
        tutorialCompleted: values.tutorialCompleted,
        themePreference: values.themePreference,
        updatedAt: values.updatedAt,
      },
    });
}

export type PublicAccount = Omit<
  ServerAccount,
  'passwordSaltHex' | 'passwordHashHex'
>;

export function toPublicAccount(account: ServerAccount): PublicAccount {
  return {
    version: account.version,
    accountId: account.accountId,
    email: account.email,
    displayName: account.displayName,
    dataKeySaltBase64: account.dataKeySaltBase64,
    wrappedDataKeyBase64: account.wrappedDataKeyBase64,
    wrappedDataKeyIvBase64: account.wrappedDataKeyIvBase64,
    familyId: account.familyId,
    license: account.license,
    tutorialCompleted: account.tutorialCompleted,
    themePreference: account.themePreference ?? 'system',
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

export async function registerAccount(input: {
  email: string;
  password: string;
  displayName: string;
  dataKeySaltBase64: string;
  wrappedDataKeyBase64: string;
  wrappedDataKeyIvBase64: string;
}): Promise<ServerAccount> {
  const email = input.email.trim().toLowerCase();
  if (!email || input.password.length < 8) {
    throw new Error('Inserisci email e una password di almeno 8 caratteri');
  }
  if (await findAccountByEmail(email)) {
    throw new Error('Esiste già un account con questa email');
  }

  const saltHex = randomBytes(16).toString('hex');
  const now = new Date().toISOString();
  const account: ServerAccount = {
    version: '1.0.0',
    accountId: createId(),
    email,
    displayName: input.displayName.trim() || email.split('@')[0] || 'Utente',
    passwordSaltHex: saltHex,
    passwordHashHex: hashPassword(input.password, saltHex),
    dataKeySaltBase64: input.dataKeySaltBase64,
    wrappedDataKeyBase64: input.wrappedDataKeyBase64,
    wrappedDataKeyIvBase64: input.wrappedDataKeyIvBase64,
    familyId: null,
    license: createInitialLicense(resolveConfiguredTier()),
    tutorialCompleted: false,
    themePreference: 'system',
    createdAt: now,
    updatedAt: now,
  };
  await saveAccount(account);
  return account;
}

export async function authenticateAccount(
  email: string,
  password: string
): Promise<ServerAccount> {
  const account = await findAccountByEmail(email);
  if (
    !account ||
    !verifyPassword(password, account.passwordSaltHex, account.passwordHashHex)
  ) {
    throw new Error('Email o password non validi');
  }
  return account;
}

export async function createSession(accountId: string): Promise<SessionRecord> {
  await ensureDbSchema();
  const now = Date.now();
  const session: SessionRecord = {
    sessionToken: randomBytes(32).toString('base64url'),
    accountId,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
  };
  await getDb().insert(sessions).values(session);
  return session;
}

export async function getSession(
  token: string | undefined | null
): Promise<SessionRecord | null> {
  if (!token) return null;
  await ensureDbSchema();
  const rows = await getDb()
    .select()
    .from(sessions)
    .where(eq(sessions.sessionToken, token))
    .limit(1);
  const session = rows[0];
  if (!session) return null;
  if (Date.parse(session.expiresAt) <= Date.now()) {
    await destroySession(token);
    return null;
  }
  return session;
}

export async function destroySession(token: string): Promise<void> {
  await ensureDbSchema();
  await getDb().delete(sessions).where(eq(sessions.sessionToken, token));
}

export async function getFamily(familyId: string): Promise<DomuFamily | null> {
  await ensureDbSchema();
  const rows = await getDb()
    .select()
    .from(families)
    .where(eq(families.familyId, familyId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return row.document as DomuFamily;
}

export async function saveFamily(family: DomuFamily): Promise<void> {
  await ensureDbSchema();
  const values = {
    familyId: family.familyId,
    document: family,
    scanToken: family.scanToken ?? null,
    emergencyToken: family.emergencyToken ?? null,
    createdAt: family.createdAt,
    updatedAt: family.updatedAt,
  };
  await getDb()
    .insert(families)
    .values(values)
    .onConflictDoUpdate({
      target: families.familyId,
      set: {
        document: values.document,
        scanToken: values.scanToken,
        emergencyToken: values.emergencyToken,
        updatedAt: values.updatedAt,
      },
    });
}

export async function createFamilyOnServer(input: {
  name: string;
  ownerAccountId: string;
  ownerEmail: string;
  ownerDisplayName: string;
}): Promise<DomuFamily> {
  const name = input.name.trim();
  if (!name) throw new Error('Inserisci un nome per la Famiglia');
  const now = new Date().toISOString();
  const owner: FamilyMember = {
    accountId: input.ownerAccountId,
    email: input.ownerEmail,
    displayName: input.ownerDisplayName,
    role: 'OWNER',
    joinedAt: now,
  };
  const family: DomuFamily = {
    version: '1.0.0',
    familyId: createId(),
    name,
    ownerAccountId: input.ownerAccountId,
    members: [owner],
    invites: [],
    scanToken: randomBytes(18).toString('base64url'),
    createdAt: now,
    updatedAt: now,
  };
  await saveFamily(family);
  return family;
}

export async function createInviteOnServer(input: {
  familyId: string;
  createdByAccountId: string;
  sealedFamilyKey: SealedKeyBlob;
  clientToken: string;
}): Promise<{ family: DomuFamily; invite: FamilyInvite; inviteCode: string }> {
  const family = await getFamily(input.familyId);
  if (!family) throw new Error('Famiglia non trovata');
  if (!family.members.some((m) => m.accountId === input.createdByAccountId)) {
    throw new Error('Solo i membri possono invitare');
  }
  if (
    !input.sealedFamilyKey?.ivBase64 ||
    !input.sealedFamilyKey?.ciphertextBase64
  ) {
    throw new Error('Chiave Famiglia mancante sull’invito');
  }
  const token = input.clientToken.trim();
  if (token.length < 16 || token.includes('.')) {
    throw new Error('Token invito non valido');
  }
  const now = Date.now();
  const invite: FamilyInvite = {
    inviteId: createId(),
    token,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + INVITE_TTL_MS).toISOString(),
    createdByAccountId: input.createdByAccountId,
    sealedFamilyKey: {
      ivBase64: input.sealedFamilyKey.ivBase64,
      ciphertextBase64: input.sealedFamilyKey.ciphertextBase64,
    },
  };
  const next: DomuFamily = {
    ...family,
    invites: [...family.invites.filter((i) => !i.acceptedByAccountId), invite],
    updatedAt: new Date(now).toISOString(),
  };
  await saveFamily(next);
  return {
    family: next,
    invite,
    inviteCode: `df1.${family.familyId}.${token}`,
  };
}

export async function putMemberKeyWrapOnServer(input: {
  familyId: string;
  accountId: string;
  wrap: SealedKeyBlob;
}): Promise<DomuFamily> {
  const family = await getFamily(input.familyId);
  if (!family) throw new Error('Famiglia non trovata');
  if (!family.members.some((m) => m.accountId === input.accountId)) {
    throw new Error('Non sei membro di questa Famiglia');
  }
  if (!input.wrap?.ivBase64 || !input.wrap?.ciphertextBase64) {
    throw new Error('Wrap chiave non valido');
  }
  const next: DomuFamily = {
    ...family,
    memberKeyWraps: {
      ...(family.memberKeyWraps ?? {}),
      [input.accountId]: {
        ivBase64: input.wrap.ivBase64,
        ciphertextBase64: input.wrap.ciphertextBase64,
      },
    },
    updatedAt: new Date().toISOString(),
  };
  await saveFamily(next);
  return next;
}

export function findOpenInviteSeal(
  family: DomuFamily,
  token: string
): SealedKeyBlob | null {
  const invite = family.invites.find(
    (i) => i.token === token && !i.acceptedByAccountId
  );
  if (!invite?.sealedFamilyKey) return null;
  if (Date.parse(invite.expiresAt) <= Date.now()) return null;
  return invite.sealedFamilyKey;
}

export async function acceptInviteOnServer(input: {
  inviteCode: string;
  accountId: string;
  email: string;
  displayName: string;
}): Promise<DomuFamily> {
  const parts = input.inviteCode.trim().split('.');
  if (parts.length !== 3 || parts[0] !== 'df1') {
    throw new Error('Codice invito non valido');
  }
  const familyId = parts[1]!;
  const token = parts[2]!;
  const family = await getFamily(familyId);
  if (!family) throw new Error('Famiglia non trovata per questo invito');
  if (family.members.some((m) => m.accountId === input.accountId)) {
    return family;
  }
  if (family.members.some((m) => m.email === input.email)) {
    throw new Error('Questa email è già nella Famiglia');
  }
  const invite = family.invites.find(
    (i) => i.token === token && !i.acceptedByAccountId
  );
  if (!invite) throw new Error('Invito non valido o già usato');
  if (Date.parse(invite.expiresAt) <= Date.now()) {
    throw new Error('Invito scaduto: chiedi un nuovo QR');
  }
  const now = new Date().toISOString();
  const member: FamilyMember = {
    accountId: input.accountId,
    email: input.email,
    displayName: input.displayName,
    role: 'MEMBER',
    joinedAt: now,
  };
  const next: DomuFamily = {
    ...family,
    members: [...family.members, member],
    invites: family.invites.map((i) =>
      i.inviteId === invite.inviteId
        ? { ...i, acceptedByAccountId: input.accountId }
        : i
    ),
    updatedAt: now,
  };
  await saveFamily(next);
  return next;
}

export async function assertFamilyMember(
  familyId: string,
  accountId: string
): Promise<DomuFamily> {
  const family = await getFamily(familyId);
  if (!family) throw new Error('Famiglia non trovata');
  if (!family.members.some((m) => m.accountId === accountId)) {
    throw new Error('Accesso negato alla Famiglia');
  }
  return family;
}

async function readBlob(
  familyId: string,
  kind: BlobKind
): Promise<EncryptedAccountBlob | null> {
  await ensureDbSchema();
  const rows = await getDb()
    .select()
    .from(familyBlobs)
    .where(
      and(eq(familyBlobs.familyId, familyId), eq(familyBlobs.kind, kind))
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    version: 'enc-1',
    ivBase64: row.ivBase64,
    ciphertextBase64: row.ciphertextBase64,
    updatedAt: row.updatedAt,
  };
}

async function writeBlob(
  familyId: string,
  kind: BlobKind,
  blob: EncryptedAccountBlob
): Promise<void> {
  await ensureDbSchema();
  const updatedAt = blob.updatedAt || new Date().toISOString();
  await getDb()
    .insert(familyBlobs)
    .values({
      familyId,
      kind,
      version: blob.version || 'enc-1',
      ivBase64: blob.ivBase64,
      ciphertextBase64: blob.ciphertextBase64,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: [familyBlobs.familyId, familyBlobs.kind],
      set: {
        version: blob.version || 'enc-1',
        ivBase64: blob.ivBase64,
        ciphertextBase64: blob.ciphertextBase64,
        updatedAt,
      },
    });
}

export async function readHousesBlob(
  familyId: string
): Promise<EncryptedAccountBlob | null> {
  return readBlob(familyId, 'houses');
}

export async function writeHousesBlob(
  familyId: string,
  blob: EncryptedAccountBlob
): Promise<void> {
  await writeBlob(familyId, 'houses', blob);
}

export async function readSuccessionBlob(
  familyId: string
): Promise<EncryptedAccountBlob | null> {
  return readBlob(familyId, 'succession');
}

export async function writeSuccessionBlob(
  familyId: string,
  blob: EncryptedAccountBlob
): Promise<void> {
  await writeBlob(familyId, 'succession', blob);
}

export async function readEmergencyBlob(
  familyId: string
): Promise<EncryptedAccountBlob | null> {
  return readBlob(familyId, 'emergency');
}

export async function writeEmergencyBlob(
  familyId: string,
  blob: EncryptedAccountBlob
): Promise<void> {
  await writeBlob(familyId, 'emergency', blob);
}

export async function publishEmergencyPackOnServer(input: {
  familyId: string;
  accountId: string;
  blob: EncryptedAccountBlob;
  rotateToken?: boolean;
}): Promise<{ family: DomuFamily; token: string }> {
  const family = await assertFamilyMember(input.familyId, input.accountId);
  const token =
    !input.rotateToken && family.emergencyToken
      ? family.emergencyToken
      : randomBytes(18).toString('base64url');
  const next: DomuFamily = {
    ...family,
    emergencyToken: token,
    updatedAt: new Date().toISOString(),
  };
  await saveFamily(next);
  await writeEmergencyBlob(input.familyId, input.blob);
  return { family: next, token };
}

export async function findFamilyByEmergencyToken(
  token: string
): Promise<DomuFamily | null> {
  const normalized = token.trim();
  if (!normalized) return null;
  await ensureDbSchema();
  const rows = await getDb()
    .select()
    .from(families)
    .where(eq(families.emergencyToken, normalized))
    .limit(1);
  const row = rows[0];
  return row ? (row.document as DomuFamily) : null;
}

export async function ensureFamilyScanToken(
  familyId: string
): Promise<DomuFamily> {
  const family = await getFamily(familyId);
  if (!family) throw new Error('Famiglia non trovata');
  if (family.scanToken) return family;
  const next: DomuFamily = {
    ...family,
    scanToken: randomBytes(18).toString('base64url'),
    updatedAt: new Date().toISOString(),
  };
  await saveFamily(next);
  return next;
}

export async function findFamilyByScanToken(
  token: string
): Promise<DomuFamily | null> {
  const normalized = token.trim();
  if (!normalized) return null;
  await ensureDbSchema();
  const rows = await getDb()
    .select()
    .from(families)
    .where(eq(families.scanToken, normalized))
    .limit(1);
  const row = rows[0];
  return row ? (row.document as DomuFamily) : null;
}

export async function updateFamilyBranding(
  familyId: string,
  branding: FamilyBranding | null
): Promise<DomuFamily> {
  const family = await getFamily(familyId);
  if (!family) throw new Error('Famiglia non trovata');
  const next: DomuFamily = {
    ...family,
    branding: branding ?? undefined,
    updatedAt: new Date().toISOString(),
  };
  if (!branding) {
    delete next.branding;
  }
  await saveFamily(next);
  return next;
}

export async function readAuditLog(
  familyId: string
): Promise<AuditLogDocument> {
  await ensureDbSchema();
  const rows = await getDb()
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.familyId, familyId))
    .limit(1);
  const existing = rows[0]?.document as AuditLogDocument | undefined;
  if (existing?.version === '1.0.0') return existing;
  return {
    version: '1.0.0',
    familyId,
    entries: [],
    updatedAt: new Date().toISOString(),
  };
}

export async function getLastBreakGlassAccess(familyId: string): Promise<{
  at: string;
  actorLabel: string;
  note?: string;
} | null> {
  const log = await readAuditLog(familyId);
  const hit = log.entries.find((e) => e.kind === 'BREAK_GLASS');
  if (!hit) return null;
  return {
    at: hit.at,
    actorLabel: hit.actorLabel,
    note: hit.note,
  };
}

export async function appendAuditEntry(
  familyId: string,
  entry: Omit<AuditLogEntry, 'id' | 'at'> & { id?: string; at?: string }
): Promise<AuditLogDocument> {
  await ensureDbSchema();
  const current = await readAuditLog(familyId);
  const full: AuditLogEntry = {
    id: entry.id ?? createId(),
    kind: entry.kind,
    at: entry.at ?? new Date().toISOString(),
    actorLabel: entry.actorLabel.slice(0, 120),
    note: entry.note?.slice(0, 280),
    houseName: entry.houseName?.slice(0, 120),
    ipHash: entry.ipHash,
  };
  const entries = [full, ...current.entries].slice(0, AUDIT_LOG_MAX_ENTRIES);
  const next: AuditLogDocument = {
    version: '1.0.0',
    familyId,
    entries,
    updatedAt: new Date().toISOString(),
  };
  await getDb()
    .insert(auditLogs)
    .values({
      familyId,
      document: next,
      updatedAt: next.updatedAt,
    })
    .onConflictDoUpdate({
      target: auditLogs.familyId,
      set: {
        document: next,
        updatedAt: next.updatedAt,
      },
    });
  return next;
}

export function hashIpForAudit(
  ip: string | null | undefined
): string | undefined {
  if (!ip) return undefined;
  return createHash('sha256')
    .update(`domusafe-audit:${ip}`)
    .digest('hex')
    .slice(0, 16);
}

/** Helper smoke/test: svuota tabelle Postgres. */
export async function resetAppDataForTests(): Promise<void> {
  await resetDatabaseForTests();
}
