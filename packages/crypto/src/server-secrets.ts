import { fromBase64Url, toBase64Url, uintBE, type Bytes } from './bytes.js';
import { CryptoFormatError } from './errors.js';
import { openS1, s1KeyVersion, sealS1 } from './formats.js';
import { HKDF_LABELS, aad } from './labels.js';
import { KEY_LENGTH, hkdf, hkdfInfo, importAesKey } from './primitives.js';

/** One master key of the class S keyring. */
export interface MasterKey {
  readonly version: number;
  readonly key: Bytes;
}

/**
 * Parses `DOMUSAFE_MASTER_KEYS`: comma-separated `version:base64url` entries of 32-byte keys.
 *
 * @param value - Environment variable value, for example `1:AAEC…,2:ICEi…`.
 * @returns Master keys sorted by version.
 * @throws CryptoFormatError when an entry is malformed, a key is not 32 bytes or a version repeats.
 */
export function parseMasterKeys(value: string): MasterKey[] {
  const keys = value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const [versionText, keyText] = entry.split(':');
      const version = Number(versionText);
      if (!Number.isInteger(version) || version < 1 || version > 65_535 || keyText === undefined) {
        throw new CryptoFormatError('Malformed master key entry');
      }
      const key = fromBase64Url(keyText);
      if (key.length !== KEY_LENGTH) {
        throw new CryptoFormatError('Master keys must be 32 bytes');
      }
      return { version, key };
    })
    .sort((a, b) => a.version - b.version);
  if (new Set(keys.map((key) => key.version)).size !== keys.length) {
    throw new CryptoFormatError('Duplicate master key version');
  }
  return keys;
}

/**
 * Seals and opens class S secrets (TOTP-adjacent secrets, PIN server shares, integration tokens) with
 * versioned master keys. The AES key of version `n` is `HKDF(master_n, "domusafe/s1/master" ‖ uint16(n))`.
 */
export class ServerSecretBox {
  readonly #keys: ReadonlyMap<number, CryptoKey>;
  readonly #activeVersion: number;
  readonly #activeMaster: Bytes;

  private constructor(keys: ReadonlyMap<number, CryptoKey>, activeVersion: number, activeMaster: Bytes) {
    this.#keys = keys;
    this.#activeVersion = activeVersion;
    this.#activeMaster = activeMaster;
  }

  /**
   * Builds the box from parsed master keys.
   *
   * @param masterKeys - Output of `parseMasterKeys`.
   * @param activeVersion - Version used for new seals; must be present in `masterKeys`.
   * @returns A ready box.
   * @throws CryptoFormatError when the active version is missing.
   */
  static async create(masterKeys: readonly MasterKey[], activeVersion: number): Promise<ServerSecretBox> {
    const active = masterKeys.find((key) => key.version === activeVersion);
    if (active === undefined) {
      throw new CryptoFormatError('Active master key version not configured');
    }
    const entries = await Promise.all(
      masterKeys.map(async ({ version, key }) => {
        const derived = await hkdf(key, hkdfInfo(HKDF_LABELS.serverMaster, uintBE(version, 2)));
        return [version, await importAesKey(derived)] as const;
      }),
    );
    return new ServerSecretBox(new Map(entries), activeVersion, active.key);
  }

  /** Version used for new seals. */
  get activeVersion(): number {
    return this.#activeVersion;
  }

  /**
   * Seals a secret bound to its table, column and row.
   *
   * @param plaintext - Secret bytes.
   * @param location - Table, column and row id that will store the blob.
   * @returns `S1` blob sealed with the active version.
   */
  async seal(plaintext: Bytes, location: { table: string; column: string; rowId: string }): Promise<Bytes> {
    const key = this.#keys.get(this.#activeVersion);
    if (key === undefined) {
      throw new CryptoFormatError('Active master key unavailable');
    }
    return sealS1(
      key,
      this.#activeVersion,
      plaintext,
      aad.serverSecret(location.table, location.column, location.rowId),
    );
  }

  /**
   * Opens a secret sealed with any configured version.
   *
   * @param blob - `S1` blob.
   * @param location - Table, column and row id the blob was read from.
   * @returns Secret bytes.
   * @throws CryptoFormatError when the version is not configured; DecryptionError when the location differs.
   */
  async open(blob: Bytes, location: { table: string; column: string; rowId: string }): Promise<Bytes> {
    const key = this.#keys.get(s1KeyVersion(blob));
    if (key === undefined) {
      throw new CryptoFormatError('Master key version not configured');
    }
    return openS1(key, blob, aad.serverSecret(location.table, location.column, location.rowId));
  }

  /**
   * Whether a blob must be re-sealed during master-key rotation.
   *
   * @param blob - `S1` blob.
   * @returns `true` when the blob uses a version other than the active one.
   */
  needsReseal(blob: Bytes): boolean {
    return s1KeyVersion(blob) !== this.#activeVersion;
  }

  /**
   * Derives the Better Auth secret from the active master key, so rotating the master key rotates it too.
   *
   * @returns Base64url text of 32 derived bytes.
   */
  async betterAuthSecret(): Promise<string> {
    return toBase64Url(await hkdf(this.#activeMaster, hkdfInfo(HKDF_LABELS.betterAuth)));
  }
}
