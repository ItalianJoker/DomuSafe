import { BACKUP_KDF_PARAMS, KDF_SALT_LENGTH, deriveBackupKey, type Argon2Params } from './kdf.js';
import { aad } from './labels.js';
import {
  concatBytes,
  copyBytes,
  fromUtf8,
  randomBytes,
  readUintBE,
  sha256,
  toHex,
  uintBE,
  utf8,
  type Bytes,
} from './bytes.js';
import { CryptoFormatError } from './errors.js';
import { sealStream, openStream } from './formats.js';
import { importAesKey } from './primitives.js';
import { bytesToWords } from './words.js';

/** Magic of `DS-BACKUP v1` files (ASCII `DSBK`). */
const BACKUP_MAGIC = utf8('DSBK');
/** Version byte of `DS-BACKUP v1`. */
export const BACKUP_VERSION = 0x01;
/** Suggested passphrase length in Italian words (phase 2 §8.15). */
export const BACKUP_PHRASE_WORD_COUNT = 6;
/** Minimum passphrase length in characters. */
export const BACKUP_PASSPHRASE_MIN_LENGTH = 12;

/** Entry type: manifest JSON. */
export const BACKUP_ENTRY_MANIFEST = 0x01;
/** Entry type: one record JSON. */
export const BACKUP_ENTRY_RECORD = 0x02;
/** Entry type: file metadata JSON. */
export const BACKUP_ENTRY_FILE_META = 0x03;
/** Entry type: file bytes for the previous meta entry. */
export const BACKUP_ENTRY_FILE_BYTES = 0x04;
/** Entry type: final counts. */
export const BACKUP_ENTRY_FOOTER = 0xff;

/** KDF parameters stored in the backup header. */
export interface BackupKdfHeader {
  readonly algorithm: 'argon2id';
  readonly memoryKib: number;
  readonly iterations: number;
  readonly parallelism: number;
  readonly salt: string;
}

/** JSON header of a `DS-BACKUP v1` file (UTF-8 inside the file). */
export interface BackupHeader {
  readonly format: 'DS-BACKUP';
  readonly version: 1;
  readonly createdAt: string;
  readonly appVersion: string;
  readonly accountId: string;
  readonly familyIds: readonly string[];
  readonly kdf: BackupKdfHeader;
}

/** One record sealed into the backup body (phase 2 §8.15 type `0x02`). */
export interface BackupBodyRecord {
  readonly module: string;
  readonly table: string;
  readonly id: string;
  readonly version: number;
  readonly data: Record<string, unknown>;
}

/** Plaintext payload assembled before gzip and stream encryption. */
export interface BackupPlaintext {
  readonly header: BackupHeader;
  readonly records: readonly BackupBodyRecord[];
  readonly counts: Readonly<Record<string, number>>;
}

/**
 * Proposes a six-word Italian passphrase for a new backup file.
 *
 * Preconditions: the Web Crypto random source is available.
 * Postconditions: the phrase has {@link BACKUP_PHRASE_WORD_COUNT} space-separated words.
 * Data contract: words come from the Italian BIP-39 list; entropy is 66 bits.
 *
 * @returns Space-separated passphrase.
 */
export function generateBackupPassphrase(): string {
  const neededBytes = Math.ceil((BACKUP_PHRASE_WORD_COUNT * 11) / 8);
  return bytesToWords(randomBytes(neededBytes), BACKUP_PHRASE_WORD_COUNT).join(' ');
}

/**
 * Validates a backup passphrase before sealing.
 *
 * @param passphrase - Candidate passphrase.
 * @returns `true` when length is at least {@link BACKUP_PASSPHRASE_MIN_LENGTH}.
 */
export function isValidBackupPassphrase(passphrase: string): boolean {
  return passphrase.normalize('NFKC').length >= BACKUP_PASSPHRASE_MIN_LENGTH;
}

async function gzipCompress(data: Bytes): Promise<Bytes> {
  const stream = new CompressionStream('gzip');
  const writer = stream.writable.getWriter();
  await writer.write(data);
  await writer.close();
  return readStream(stream.readable);
}

async function gzipDecompress(data: Bytes): Promise<Bytes> {
  const stream = new DecompressionStream('gzip');
  const writer = stream.writable.getWriter();
  await writer.write(data);
  await writer.close();
  return readStream(stream.readable);
}

async function readStream(readable: ReadableStream<Uint8Array>): Promise<Bytes> {
  const reader = readable.getReader();
  const parts: Bytes[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    parts.push(copyBytes(value));
  }
  return concatBytes(...parts);
}

function encodeEntry(type: number, content: Bytes): Bytes {
  return concatBytes(Uint8Array.of(type), uintBE(content.length, 4), content);
}

/**
 * Builds the gzip-ready plaintext body: manifest, records, footer.
 *
 * @param records - Rows to store.
 * @param schemaVersion - Data schema version stamped in the manifest.
 * @returns Body bytes before gzip.
 */
export function encodeBackupBody(records: readonly BackupBodyRecord[], schemaVersion = 1): Bytes {
  const byModule: Record<string, number> = {};
  const byTable: Record<string, number> = {};
  const parts: Bytes[] = [];
  for (const record of records) {
    byModule[record.module] = (byModule[record.module] ?? 0) + 1;
    byTable[record.table] = (byTable[record.table] ?? 0) + 1;
  }
  const manifest = utf8(
    JSON.stringify({
      schemaVersion,
      modules: byModule,
      tables: byTable,
      recordCount: records.length,
    }),
  );
  parts.push(encodeEntry(BACKUP_ENTRY_MANIFEST, manifest));
  for (const record of records) {
    parts.push(encodeEntry(BACKUP_ENTRY_RECORD, utf8(JSON.stringify(record))));
  }
  const footer = utf8(
    JSON.stringify({
      manifest: 1,
      records: records.length,
      fileMeta: 0,
      fileBytes: 0,
    }),
  );
  parts.push(encodeEntry(BACKUP_ENTRY_FOOTER, footer));
  return concatBytes(...parts);
}

/**
 * Parses a decompressed backup body into records.
 *
 * @param body - Decompressed entry sequence.
 * @returns Records of type `0x02`.
 * @throws CryptoFormatError when the layout is truncated or unknown.
 */
export function decodeBackupBody(body: Bytes): BackupBodyRecord[] {
  const records: BackupBodyRecord[] = [];
  let offset = 0;
  let sawFooter = false;
  while (offset < body.length) {
    if (offset + 5 > body.length) {
      throw new CryptoFormatError('Truncated backup entry header');
    }
    const type = body[offset] ?? 0;
    const length = readUintBE(body, offset + 1, 4);
    offset += 5;
    if (offset + length > body.length) {
      throw new CryptoFormatError('Truncated backup entry');
    }
    const content = body.slice(offset, offset + length);
    offset += length;
    if (type === BACKUP_ENTRY_RECORD) {
      const parsed: unknown = JSON.parse(fromUtf8(content));
      if (!isBackupBodyRecord(parsed)) {
        throw new CryptoFormatError('Invalid backup record entry');
      }
      records.push(parsed);
    } else if (type === BACKUP_ENTRY_FOOTER) {
      sawFooter = true;
      break;
    } else if (
      type !== BACKUP_ENTRY_MANIFEST &&
      type !== BACKUP_ENTRY_FILE_META &&
      type !== BACKUP_ENTRY_FILE_BYTES
    ) {
      throw new CryptoFormatError(`Unknown backup entry type ${String(type)}`);
    }
  }
  if (!sawFooter) {
    throw new CryptoFormatError('Backup body missing footer');
  }
  return records;
}

function saltFromHex(hex: string): Bytes {
  if (!/^[0-9a-f]{32}$/iu.test(hex)) {
    throw new CryptoFormatError('Backup salt must be 16 bytes hex');
  }
  const out = new Uint8Array(16);
  for (let index = 0; index < 16; index += 1) {
    out[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return out;
}

/**
 * Seals a `DS-BACKUP v1` file (`.domusafe-backup`) with a user-chosen passphrase.
 *
 * Preconditions: `passphrase` passes {@link isValidBackupPassphrase}; `familyIds` is non-empty.
 * Postconditions: the returned bytes start with `DSBK` and can be opened only with the same passphrase.
 * Data contract: the body is gzip then `DS-STREAM v1` with AAD `aad.backup(sha256(headerJson))`.
 * Class A/B payloads inside records stay as sealed envelopes; this layer does not decrypt them.
 *
 * @param input - Header fields, records and passphrase.
 * @param options - Optional fixed salt and KDF params (tests).
 * @returns File bytes.
 */
export async function sealBackup(
  input: {
    readonly passphrase: string;
    readonly accountId: string;
    readonly familyIds: readonly string[];
    readonly appVersion: string;
    readonly createdAt?: string;
    readonly records: readonly BackupBodyRecord[];
  },
  options: { readonly salt?: Bytes; readonly kdf?: Argon2Params } = {},
): Promise<Bytes> {
  if (!isValidBackupPassphrase(input.passphrase)) {
    throw new RangeError('Backup passphrase is too short');
  }
  if (input.familyIds.length === 0) {
    throw new RangeError('Backup requires at least one family id');
  }
  const salt = options.salt ?? randomBytes(KDF_SALT_LENGTH);
  if (salt.length !== KDF_SALT_LENGTH) {
    throw new RangeError('Backup salt must be 16 bytes');
  }
  const kdf = options.kdf ?? BACKUP_KDF_PARAMS;
  const header: BackupHeader = {
    format: 'DS-BACKUP',
    version: 1,
    createdAt: input.createdAt ?? new Date().toISOString(),
    appVersion: input.appVersion,
    accountId: input.accountId,
    familyIds: [...input.familyIds],
    kdf: {
      algorithm: 'argon2id',
      memoryKib: kdf.memoryKib,
      iterations: kdf.iterations,
      parallelism: kdf.parallelism,
      salt: toHex(salt),
    },
  };
  const headerJson = utf8(JSON.stringify(header));
  const headerSha = toHex(await sha256(headerJson));
  const key = await importAesKey(await deriveBackupKey(input.passphrase, salt, kdf));
  const compressed = await gzipCompress(encodeBackupBody(input.records));
  const stream = await sealStream(key, compressed, aad.backup(headerSha));
  return concatBytes(
    BACKUP_MAGIC,
    Uint8Array.of(BACKUP_VERSION),
    uintBE(headerJson.length, 4),
    headerJson,
    stream,
  );
}

/**
 * Opens a `DS-BACKUP v1` file.
 *
 * Preconditions: `file` is a complete DomuSafe backup; `passphrase` matches the one used to seal.
 * Postconditions: returns the parsed header and records; file byte entries are ignored in this slice.
 * Data contract: sealed envelopes inside `data` remain encrypted.
 *
 * @param file - Backup file bytes.
 * @param passphrase - Passphrase chosen at seal time.
 * @returns Header and records.
 * @throws CryptoFormatError for a truncated or unknown file.
 * @throws DecryptionError when the passphrase or bytes do not match.
 */
export async function openBackup(
  file: Bytes,
  passphrase: string,
): Promise<{ readonly header: BackupHeader; readonly records: readonly BackupBodyRecord[] }> {
  if (file.length < 4 + 1 + 4) {
    throw new CryptoFormatError('Backup too short');
  }
  for (let index = 0; index < BACKUP_MAGIC.length; index += 1) {
    if (file[index] !== BACKUP_MAGIC[index]) {
      throw new CryptoFormatError('Not a DomuSafe backup');
    }
  }
  if (file[4] !== BACKUP_VERSION) {
    throw new CryptoFormatError('Unsupported backup version');
  }
  const headerLength = readUintBE(file, 5, 4);
  const headerStart = 9;
  const headerEnd = headerStart + headerLength;
  if (headerEnd > file.length) {
    throw new CryptoFormatError('Truncated backup header');
  }
  const headerBytes = file.slice(headerStart, headerEnd);
  const headerSha = toHex(await sha256(copyBytes(headerBytes)));
  const header = parseBackupHeader(JSON.parse(fromUtf8(headerBytes)));
  const salt = saltFromHex(header.kdf.salt);
  const key = await importAesKey(
    await deriveBackupKey(passphrase, salt, {
      memoryKib: header.kdf.memoryKib,
      iterations: header.kdf.iterations,
      parallelism: header.kdf.parallelism,
    }),
  );
  const compressed = await openStream(key, file.slice(headerEnd), aad.backup(headerSha));
  const body = await gzipDecompress(compressed);
  return { header, records: decodeBackupBody(body) };
}

function isBackupBodyRecord(value: unknown): value is BackupBodyRecord {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.module === 'string' &&
    typeof record.table === 'string' &&
    typeof record.id === 'string' &&
    typeof record.version === 'number' &&
    typeof record.data === 'object' &&
    record.data !== null
  );
}

function parseBackupHeader(value: unknown): BackupHeader {
  if (typeof value !== 'object' || value === null) {
    throw new CryptoFormatError('Invalid backup header');
  }
  const header = value as Record<string, unknown>;
  const kdf = header.kdf;
  if (
    header.format !== 'DS-BACKUP' ||
    header.version !== 1 ||
    typeof kdf !== 'object' ||
    kdf === null ||
    (kdf as Record<string, unknown>).algorithm !== 'argon2id' ||
    typeof (kdf as Record<string, unknown>).memoryKib !== 'number' ||
    typeof (kdf as Record<string, unknown>).iterations !== 'number' ||
    typeof (kdf as Record<string, unknown>).parallelism !== 'number' ||
    typeof (kdf as Record<string, unknown>).salt !== 'string' ||
    typeof header.createdAt !== 'string' ||
    typeof header.appVersion !== 'string' ||
    typeof header.accountId !== 'string' ||
    !Array.isArray(header.familyIds) ||
    !header.familyIds.every((id) => typeof id === 'string')
  ) {
    throw new CryptoFormatError('Invalid backup header');
  }
  return {
    format: 'DS-BACKUP',
    version: 1,
    createdAt: header.createdAt,
    appVersion: header.appVersion,
    accountId: header.accountId,
    familyIds: header.familyIds,
    kdf: {
      algorithm: 'argon2id',
      memoryKib: (kdf as BackupKdfHeader).memoryKib,
      iterations: (kdf as BackupKdfHeader).iterations,
      parallelism: (kdf as BackupKdfHeader).parallelism,
      salt: (kdf as BackupKdfHeader).salt,
    },
  };
}
