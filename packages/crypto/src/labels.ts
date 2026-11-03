import { utf8, type Bytes } from './bytes.js';

/**
 * HKDF `info` labels (phase 2, §8.4). Every derivation in DomuSafe uses one of these constants;
 * changing a value breaks every existing key and is therefore a format version change.
 */
export const HKDF_LABELS = {
  accountPrivateKeyKek: 'domusafe/v1/account-private-key-kek',
  vaultSecret: 'domusafe/v1/vault-secret',
  vaultUnlock: 'domusafe/v1/vault-unlock',
  recoveryAccountKeyKek: 'domusafe/v1/recovery/account-key-kek',
  recoveryPrivateKeyKek: 'domusafe/v1/recovery/private-key-kek',
  recoveryVerifier: 'domusafe/v1/recovery/verifier',
  grant: 'domusafe/v1/grant',
  pairingSas: 'domusafe/v1/pairing/sas',
  pairingTransferKey: 'domusafe/v1/pairing/transfer-key',
  serverMaster: 'domusafe/s1/master',
  betterAuth: 'domusafe/s1/better-auth',
} as const;

/** Kind of public key that receives a scope-key grant. */
export type GranteeKind = 'account' | 'vault' | 'kiosk';

const COMPONENT = /^[A-Za-z0-9_.:-]{1,128}$/;

function component(value: string, name: string): string {
  if (!COMPONENT.test(value)) {
    throw new TypeError(`Invalid associated-data component "${name}"`);
  }
  return value;
}

function integer(value: number, name: string): string {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`Invalid associated-data integer "${name}"`);
  }
  return String(value);
}

function build(prefix: string, parts: readonly string[]): Bytes {
  return utf8([prefix, ...parts].join('|'));
}

/**
 * Builders for the authenticated associated data of every encrypted object (phase 2, §8.3).
 *
 * Precondition: identifiers are UUIDs or snake_case table names (validated; `|` is never allowed).
 * Postcondition: the same inputs always produce the same bytes, so ciphertext moved to another
 * record, version, scope or recipient fails authentication.
 */
export const aad = {
  record: (table: string, recordId: string, version: number): Bytes =>
    build('domusafe/v1/record', [component(table, 'table'), component(recordId, 'recordId'), integer(version, 'version')]),
  dek: (table: string, recordId: string, scopeId: string, scopeVersion: number): Bytes =>
    build('domusafe/v1/dek', [
      component(table, 'table'),
      component(recordId, 'recordId'),
      component(scopeId, 'scopeId'),
      integer(scopeVersion, 'scopeVersion'),
    ]),
  file: (fileId: string): Bytes => build('domusafe/v1/file', [component(fileId, 'fileId')]),
  fileMeta: (fileId: string): Bytes => build('domusafe/v1/file-meta', [component(fileId, 'fileId')]),
  grant: (scopeId: string, version: number, grantee: GranteeKind, granteeId: string): Bytes =>
    build('domusafe/v1/grant', [
      component(scopeId, 'scopeId'),
      integer(version, 'version'),
      `${grantee}:${component(granteeId, 'granteeId')}`,
    ]),
  accountPrivateKey: (accountId: string): Bytes =>
    build('domusafe/v1/account-private-key', [component(accountId, 'accountId')]),
  deviceAccountKey: (accountId: string, deviceId: string): Bytes =>
    build('domusafe/v1/device-account-key', [component(accountId, 'accountId'), component(deviceId, 'deviceId')]),
  vaultPrivateKey: (accountId: string, pinGeneration: number): Bytes =>
    build('domusafe/v1/vault-private-key', [component(accountId, 'accountId'), integer(pinGeneration, 'pinGeneration')]),
  recoveryAccountKey: (accountId: string): Bytes =>
    build('domusafe/v1/recovery-account-key', [component(accountId, 'accountId')]),
  recoveryPrivateKey: (accountId: string): Bytes =>
    build('domusafe/v1/recovery-private-key', [component(accountId, 'accountId')]),
  recoveryVaultKey: (accountId: string): Bytes =>
    build('domusafe/v1/recovery-vault-key', [component(accountId, 'accountId')]),
  invitePackage: (invitationId: string): Bytes =>
    build('domusafe/v1/invite-package', [component(invitationId, 'invitationId')]),
  emergency: (qrId: string, snapshotVersion: number): Bytes =>
    build('domusafe/v1/emergency', [component(qrId, 'qrId'), integer(snapshotVersion, 'snapshotVersion')]),
  emergencyKey: (qrId: string, scopeId: string, scopeVersion: number): Bytes =>
    build('domusafe/v1/emergency-key', [
      component(qrId, 'qrId'),
      component(scopeId, 'scopeId'),
      integer(scopeVersion, 'scopeVersion'),
    ]),
  pairing: (channelId: string, deviceId: string): Bytes =>
    build('domusafe/v1/pairing', [component(channelId, 'channelId'), component(deviceId, 'deviceId')]),
  backup: (headerSha256Hex: string): Bytes => build('domusafe/v1/backup', [component(headerSha256Hex, 'header')]),
  cache: (accountId: string, queryHashHex: string): Bytes =>
    build('domusafe/v1/cache', [component(accountId, 'accountId'), component(queryHashHex, 'queryHash')]),
  serverSecret: (table: string, column: string, rowId: string): Bytes =>
    build('domusafe/s1', [`${component(table, 'table')}.${component(column, 'column')}`, component(rowId, 'rowId')]),
} as const;
