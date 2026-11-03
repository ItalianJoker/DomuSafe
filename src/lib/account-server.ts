/**
 * Store account/Famiglia self-host (filesystem) — unica fonte di verità.
 * Zero IndexedDB/localStorage per dati durevoli. Blobs sensibili: solo ciphertext.
 *
 * Dir: `DOMUSAFE_DATA_DIR` oppure `./data/app`.
 */
import { mkdir, readFile, writeFile, rename, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomBytes, pbkdf2Sync, timingSafeEqual } from 'node:crypto';
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

/** Cap audit log: evita crescita illimitata su disco. */
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
  /** Wrapping material client: salt/iv/ciphertext della data-key (opaco al server). */
  dataKeySaltBase64: string;
  wrappedDataKeyBase64: string;
  wrappedDataKeyIvBase64: string;
  familyId: string | null;
  license: AccountLicenseState;
  tutorialCompleted: boolean;
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

export function getAppDataDir(): string {
  const fromEnv = process.env.DOMUSAFE_DATA_DIR?.trim();
  if (fromEnv) {
    // Path runtime (volumi Docker / test tmp): non tracciare l’intero progetto.
    return path.resolve(/* turbopackIgnore: true */ fromEnv);
  }
  return path.join(process.cwd(), 'data', 'app');
}

function accountsDir(): string {
  return path.join(getAppDataDir(), 'accounts');
}
function familiesDir(): string {
  return path.join(getAppDataDir(), 'families');
}
function sessionsDir(): string {
  return path.join(getAppDataDir(), 'sessions');
}
function blobsDir(): string {
  return path.join(getAppDataDir(), 'blobs');
}

export async function ensureAppDataDirs(): Promise<void> {
  await mkdir(accountsDir(), { recursive: true });
  await mkdir(familiesDir(), { recursive: true });
  await mkdir(sessionsDir(), { recursive: true });
  await mkdir(blobsDir(), { recursive: true });
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify(value), 'utf8');
  await rename(tmp, filePath);
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch (error) {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? (error as { code?: string }).code
        : undefined;
    if (code === 'ENOENT') return null;
    throw error;
  }
}

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

function sessionFile(token: string): string {
  const dig = createHash('sha256').update(token).digest('hex');
  return path.join(sessionsDir(), `${dig}.json`);
}

function accountFile(accountId: string): string {
  return path.join(accountsDir(), `${accountId}.json`);
}

function familyFile(familyId: string): string {
  return path.join(familiesDir(), `${familyId}.json`);
}

function housesBlobFile(familyId: string): string {
  return path.join(blobsDir(), `${familyId}.houses.json`);
}

function successionBlobFile(familyId: string): string {
  return path.join(blobsDir(), `${familyId}.succession.json`);
}

function emergencyBlobFile(familyId: string): string {
  return path.join(blobsDir(), `${familyId}.emergency.json`);
}

function auditLogFile(familyId: string): string {
  return path.join(blobsDir(), `${familyId}.audit.json`);
}

export async function findAccountByEmail(
  email: string
): Promise<ServerAccount | null> {
  await ensureAppDataDirs();
  const normalized = email.trim().toLowerCase();
  const files = await readdir(accountsDir()).catch(() => [] as string[]);
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const acc = await readJson<ServerAccount>(path.join(accountsDir(), file));
    if (acc?.email === normalized) return acc;
  }
  return null;
}

export async function getAccountById(
  accountId: string
): Promise<ServerAccount | null> {
  return readJson<ServerAccount>(accountFile(accountId));
}

export async function saveAccount(account: ServerAccount): Promise<void> {
  await ensureAppDataDirs();
  await writeJsonAtomic(accountFile(account.accountId), account);
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
  if (!account || !verifyPassword(password, account.passwordSaltHex, account.passwordHashHex)) {
    throw new Error('Email o password non validi');
  }
  return account;
}

export async function createSession(accountId: string): Promise<SessionRecord> {
  await ensureAppDataDirs();
  const now = Date.now();
  const session: SessionRecord = {
    sessionToken: randomBytes(32).toString('base64url'),
    accountId,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
  };
  await writeJsonAtomic(sessionFile(session.sessionToken), session);
  return session;
}

export async function getSession(
  token: string | undefined | null
): Promise<SessionRecord | null> {
  if (!token) return null;
  const session = await readJson<SessionRecord>(sessionFile(token));
  if (!session) return null;
  if (Date.parse(session.expiresAt) <= Date.now()) {
    await destroySession(token);
    return null;
  }
  return session;
}

export async function destroySession(token: string): Promise<void> {
  try {
    await unlink(sessionFile(token));
  } catch {
    /* absent ok */
  }
}

export async function getFamily(
  familyId: string
): Promise<DomuFamily | null> {
  return readJson<DomuFamily>(familyFile(familyId));
}

export async function saveFamily(family: DomuFamily): Promise<void> {
  await ensureAppDataDirs();
  await writeJsonAtomic(familyFile(family.familyId), family);
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
  /** Seal client della family-key (obbligatorio per workspace condiviso). */
  sealedFamilyKey: SealedKeyBlob;
  /**
   * Token scelto dal client (così può suggellare la family-key prima del POST).
   * Deve essere opaco e abbastanza lungo (≥16 char).
   */
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

/**
 * Registra/aggiorna il wrap della family-key per un membro.
 * Il server non apre il blob — solo persistenza opaca.
 */
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

/** Restituisce il seal family-key di un invito ancora valido (per il join client). */
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

export async function readHousesBlob(
  familyId: string
): Promise<EncryptedAccountBlob | null> {
  return readJson<EncryptedAccountBlob>(housesBlobFile(familyId));
}

export async function writeHousesBlob(
  familyId: string,
  blob: EncryptedAccountBlob
): Promise<void> {
  await ensureAppDataDirs();
  await writeJsonAtomic(housesBlobFile(familyId), blob);
}

export async function readSuccessionBlob(
  familyId: string
): Promise<EncryptedAccountBlob | null> {
  return readJson<EncryptedAccountBlob>(successionBlobFile(familyId));
}

export async function writeSuccessionBlob(
  familyId: string,
  blob: EncryptedAccountBlob
): Promise<void> {
  await ensureAppDataDirs();
  await writeJsonAtomic(successionBlobFile(familyId), blob);
}

/** Blob break-glass L1+L2 (ciphertext opaco — chiave solo nel QR fragment). */
export async function readEmergencyBlob(
  familyId: string
): Promise<EncryptedAccountBlob | null> {
  return readJson<EncryptedAccountBlob>(emergencyBlobFile(familyId));
}

export async function writeEmergencyBlob(
  familyId: string,
  blob: EncryptedAccountBlob
): Promise<void> {
  await ensureAppDataDirs();
  await writeJsonAtomic(emergencyBlobFile(familyId), blob);
}

/**
 * Pubblica / aggiorna il token break-glass Famiglia e il blob cifrato.
 * Restituisce il token pubblico (la chiave resta solo al client).
 */
export async function publishEmergencyPackOnServer(input: {
  familyId: string;
  accountId: string;
  blob: EncryptedAccountBlob;
  /** Se assente, genera un nuovo token (ruota QR). */
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
  await ensureAppDataDirs();
  const files = await readdir(familiesDir()).catch(() => [] as string[]);
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const family = await readJson<DomuFamily>(path.join(familiesDir(), file));
    if (family?.emergencyToken === normalized) return family;
  }
  return null;
}

/** Garantisce un scanToken sulla Famiglia (lazy per Famiglie create prima di Premium pack). */
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
  await ensureAppDataDirs();
  const files = await readdir(familiesDir()).catch(() => [] as string[]);
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const family = await readJson<DomuFamily>(path.join(familiesDir(), file));
    if (family?.scanToken === normalized) return family;
  }
  return null;
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
  const existing = await readJson<AuditLogDocument>(auditLogFile(familyId));
  if (existing?.version === '1.0.0') return existing;
  return {
    version: '1.0.0',
    familyId,
    entries: [],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Appende una voce all’audit log Famiglia (cap FIFO).
 * Metadati di accesso — non contiene ICE/vault in chiaro.
 */
export async function appendAuditEntry(
  familyId: string,
  entry: Omit<AuditLogEntry, 'id' | 'at'> & { id?: string; at?: string }
): Promise<AuditLogDocument> {
  await ensureAppDataDirs();
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
  await writeJsonAtomic(auditLogFile(familyId), next);
  return next;
}

/** Hash privacy-safe di un indirizzo (mai persistito in chiaro). */
export function hashIpForAudit(ip: string | null | undefined): string | undefined {
  if (!ip) return undefined;
  return createHash('sha256').update(`domusafe-audit:${ip}`).digest('hex').slice(0, 16);
}

/** Helper smoke/test: svuota directory dati. */
export async function resetAppDataForTests(): Promise<void> {
  const dir = getAppDataDir();
  await mkdir(/* turbopackIgnore: true */ dir, { recursive: true });
  for (const sub of ['accounts', 'families', 'sessions', 'blobs'] as const) {
    const p = path.join(/* turbopackIgnore: true */ dir, sub);
    await mkdir(/* turbopackIgnore: true */ p, { recursive: true });
    const files = await readdir(/* turbopackIgnore: true */ p).catch(
      () => [] as string[]
    );
    await Promise.all(
      files.map((f) =>
        unlink(path.join(/* turbopackIgnore: true */ p, f)).catch(
          () => undefined
        )
      )
    );
  }
}
