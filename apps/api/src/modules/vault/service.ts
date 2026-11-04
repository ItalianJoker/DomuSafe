import { createHash, timingSafeEqual } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import {
  encodeCursor,
  type AccountKeysResponse,
  type CreateVaultItemRequest,
  type Device,
  type PutAccountKeysRequest,
  type PutVaultScopeRequest,
  type RecoveryMaterial,
  type RegisterDeviceRequest,
  type ResetVaultPinRequest,
  type SetVaultPinRequest,
  type UnlockVaultResponse,
  type UpdateVaultItemRequest,
  type VaultItem,
  type VaultItemPage,
  type VaultListQuery,
  type VaultPinStatus,
  type VaultScope,
} from '@domusafe/contracts';
import {
  ENVELOPE_VERSION,
  fromBase64Url,
  toBase64Url,
  type Bytes,
  type ServerSecretBox,
} from '@domusafe/crypto';
import { recordAudit, recordRevision, withContext, type Database } from '@domusafe/db';
import { ProblemError, classifyDatabaseError } from '../../http/problem.js';
import type { KeyValueStore } from '../../infra/kv.js';
import type { AuthenticatedAccount, TenantContext } from '../../types.js';
import * as repo from './repository.js';

/** How long a vault session stays open without another vault call (phase 2 §8.7). */
const VAULT_SESSION_SECONDS = 300;
/** Wrong codes accepted before the code is locked. */
const MAX_PIN_ATTEMPTS = 5;
/** Minimum spacing between unlock attempts. */
const UNLOCK_GAP_SECONDS = 2;
/** Unlock attempts allowed in one hour, besides the five-strike lock. */
const UNLOCK_HOUR_LIMIT = 10;
/** Recovery checks allowed in one hour. */
const RECOVERY_HOUR_LIMIT = 5;

/** Argon2id parameters for the server-side hash of the code verifier (phase 2 §8.17). */
const SERVER_PIN_HASH = { memoryCost: 65_536, timeCost: 3, parallelism: 4 } as const;

const SHARE_LOCATION = { table: 'account_pins', column: 'server_share' } as const;

/**
 * Family vault: account keys, the dedicated code, and ciphertext documents.
 *
 * The code and the recovery phrase never reach this service. Callers send Argon2id verifiers.
 * Documents are accepted only as envelopes, and only while `vault-unlock:<session>` is open.
 *
 * @param db - Database bound to the application role.
 * @param store - Ephemeral store for the vault session and the attempt limits.
 * @param secrets - Class S box that seals the server share.
 * @returns The service.
 */
export function createVaultService(db: Database, store: KeyValueStore, secrets: ServerSecretBox) {
  const accountContext = (accountId: string) => ({ principal: { kind: 'account' as const, accountId } });
  const familyContext = (accountId: string, familyId: string) => ({
    principal: { kind: 'account' as const, accountId },
    familyId,
  });

  function sessionKey(sessionId: string): string {
    return `vault-unlock:${sessionId}`;
  }

  async function requireUnlocked(sessionId: string): Promise<void> {
    const key = sessionKey(sessionId);
    if ((await store.get(key)) === null) {
      throw new ProblemError('vault_locked');
    }
    await store.set(key, '1', VAULT_SESSION_SECONDS);
  }

  async function limitUnlock(accountId: string): Promise<void> {
    const gap = await store.setIfAbsent(`vault-pin-gap:${accountId}`, '1', UNLOCK_GAP_SECONDS);
    if (!gap) {
      throw new ProblemError('rate_limited', { retryAfterSeconds: UNLOCK_GAP_SECONDS });
    }
    const count = await store.increment(`vault-pin-hour:${accountId}`, 3600);
    if (count > UNLOCK_HOUR_LIMIT) {
      throw new ProblemError('rate_limited', { retryAfterSeconds: 3600 });
    }
  }

  async function limitRecovery(accountId: string): Promise<void> {
    const count = await store.increment(`vault-recovery:${accountId}`, 3600);
    if (count > RECOVERY_HOUR_LIMIT) {
      throw new ProblemError('rate_limited', { retryAfterSeconds: 3600 });
    }
  }

  function pinStatus(row: Awaited<ReturnType<typeof repo.findPin>>): VaultPinStatus {
    if (row === null) {
      return {
        state: 'not_set',
        salt: null,
        kdf: null,
        remainingAttempts: MAX_PIN_ATTEMPTS,
        pinGeneration: null,
      };
    }
    const kdf = { memoryKib: 65_536 as const, iterations: 3 as const, parallelism: 1 as const };
    if (row.lockedAt !== null) {
      return {
        state: 'locked',
        salt: toBase64Url(row.pinSalt),
        kdf,
        remainingAttempts: 0,
        pinGeneration: row.pinGeneration,
      };
    }
    return {
      state: 'active',
      salt: toBase64Url(row.pinSalt),
      kdf,
      remainingAttempts: MAX_PIN_ATTEMPTS - row.failedAttempts,
      pinGeneration: row.pinGeneration,
    };
  }

  function keysView(row: NonNullable<Awaited<ReturnType<typeof repo.findKeys>>>): AccountKeysResponse {
    return {
      state: 'ready',
      publicKey: toBase64Url(row.publicKey),
      wrappedPrivateKey: toBase64Url(row.wrappedPrivateKey),
      recoveryPublicKey: toBase64Url(row.recoveryPublicKey),
      vaultPublicKey: row.vaultPublicKey === null ? null : toBase64Url(row.vaultPublicKey),
      wrappedVaultPrivateKey:
        row.wrappedVaultPrivateKey === null ? null : toBase64Url(row.wrappedVaultPrivateKey),
      recoverySealedVaultKey:
        row.recoverySealedVaultKey === null ? null : toBase64Url(row.recoverySealedVaultKey),
      fingerprint: row.fingerprint,
    };
  }

  function itemView(row: {
    readonly id: string;
    readonly section: VaultItem['section'];
    readonly version: number;
    readonly encScopeId: string;
    readonly encKeyVersion: number;
    readonly encDek: Uint8Array<ArrayBuffer>;
    readonly encPayload: Uint8Array<ArrayBuffer>;
    readonly updatedAt: Date;
  }): VaultItem {
    return {
      id: row.id,
      section: row.section,
      version: row.version,
      sealed: {
        scopeId: row.encScopeId,
        keyVersion: row.encKeyVersion,
        dek: toBase64Url(row.encDek),
        payload: toBase64Url(row.encPayload),
      },
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async function sealShare(accountId: string, share: Bytes): Promise<Bytes> {
    return secrets.seal(share, { ...SHARE_LOCATION, rowId: accountId });
  }

  async function writePin(
    accountId: string,
    body: SetVaultPinRequest,
    mode: 'create' | 'replace',
    ip: string | null,
  ): Promise<VaultPinStatus> {
    const salt = exactBytes(body.salt, 'salt', 16);
    exactBytes(body.verifier, 'verifier', 32);
    const share = exactBytes(body.serverShare, 'serverShare', 32);
    const wrapped = envelopeBytes(body.wrappedVaultPrivateKey, 'wrappedVaultPrivateKey', 29);
    const verifierHash = await hash(body.verifier, SERVER_PIN_HASH);
    const sealedShare = await sealShare(accountId, share);
    const generation = body.pinGeneration;

    const status = await withContext(db, accountContext(accountId), async (tx) => {
      const keys = await repo.findKeys(tx, accountId);
      if (keys === null) {
        throw new ProblemError('domain_rule_violated', { detail: 'Account keys are not set' });
      }
      const current = await repo.lockPin(tx, accountId);
      if (mode === 'create') {
        if (current !== null || keys.vaultPublicKey !== null) {
          throw new ProblemError('duplicate');
        }
        if (
          generation !== 1 ||
          body.vaultPublicKey === undefined ||
          body.recoverySealedVaultKey === undefined
        ) {
          throw new ProblemError('validation_failed', {
            errors: [
              {
                path: 'body.pinGeneration',
                code: 'invalid',
                message: 'The first code requires generation 1 and a new vault key',
              },
            ],
          });
        }
        await repo.insertPin(
          tx,
          accountId,
          { salt, verifierHash, serverShareSealed: sealedShare, pinGeneration: generation },
          {
            vaultPublicKey: publicKey(body.vaultPublicKey, 'vaultPublicKey'),
            wrappedVaultPrivateKey: wrapped,
            recoverySealedVaultKey: envelopeBytes(body.recoverySealedVaultKey, 'recoverySealedVaultKey', 95),
          },
        );
      } else {
        if (current === null || keys.vaultPublicKey === null) {
          throw new ProblemError('domain_rule_violated', { detail: 'The vault code is not set' });
        }
        if (body.vaultPublicKey !== undefined || body.recoverySealedVaultKey !== undefined) {
          throw new ProblemError('validation_failed', {
            errors: [
              {
                path: 'body.recoverySealedVaultKey',
                code: 'unchanged',
                message: 'A code change does not replace the recovery seal',
              },
            ],
          });
        }
        if (generation !== current.pinGeneration + 1) {
          throw new ProblemError('domain_rule_violated', { detail: 'The code generation does not match' });
        }
        await repo.replacePin(
          tx,
          accountId,
          { salt, verifierHash, serverShareSealed: sealedShare, pinGeneration: generation },
          wrapped,
        );
      }
      await repo.recordPinEvent(tx, accountId, 'pin_set', ip);
      return pinStatus(await repo.findPin(tx, accountId));
    });
    return status;
  }

  return {
    /**
     * Returns the account key material needed on this device, without the recovery-wrapped copies.
     *
     * @param account - Authenticated account.
     * @returns `missing` until the phrase has been confirmed, then the wrapped keys.
     */
    async getKeys(account: AuthenticatedAccount): Promise<AccountKeysResponse> {
      const row = await withContext(db, accountContext(account.id), (tx) => repo.findKeys(tx, account.id));
      return row === null ? { state: 'missing' } : keysView(row);
    },

    /**
     * Stores the first account key bundle. A second call is rejected.
     *
     * Preconditions: the recovery phrase was confirmed in the browser and is not in `body`.
     * Postconditions: one `account_keys` row exists. The recovery-wrapped copies stay on the server.
     *
     * @param account - Authenticated account.
     * @param body - Wrapped keys and the SHA-256 of the recovery verifier.
     * @returns The same view as `getKeys`.
     * @throws ProblemError `duplicate` when keys already exist.
     */
    async putKeys(account: AuthenticatedAccount, body: PutAccountKeysRequest): Promise<AccountKeysResponse> {
      const values = {
        accountId: account.id,
        publicKey: publicKey(body.publicKey, 'publicKey'),
        wrappedPrivateKey: envelopeBytes(body.wrappedPrivateKey, 'wrappedPrivateKey', 29),
        recoveryPublicKey: publicKey(body.recoveryPublicKey, 'recoveryPublicKey'),
        recoveryWrappedPrivateKey: envelopeBytes(
          body.recoveryWrappedPrivateKey,
          'recoveryWrappedPrivateKey',
          29,
        ),
        recoveryWrappedAccountKey: envelopeBytes(
          body.recoveryWrappedAccountKey,
          'recoveryWrappedAccountKey',
          29,
        ),
        recoveryVerifierSha256: exactBytes(body.recoveryVerifierSha256, 'recoveryVerifierSha256', 32),
        fingerprint: body.fingerprint,
      };
      try {
        await withContext(db, accountContext(account.id), (tx) => repo.insertKeys(tx, values));
      } catch (error) {
        if (classifyDatabaseError(error).kind === 'unique') {
          throw new ProblemError('duplicate');
        }
        throw error;
      }
      return keysView({
        ...values,
        vaultPublicKey: null,
        wrappedVaultPrivateKey: null,
        recoverySealedVaultKey: null,
        keyGeneration: 1,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    },

    /**
     * Registers this browser's wrapped account key.
     *
     * @param account - Authenticated account.
     * @param body - Device id and the account key wrapped by the device key.
     * @returns The stored device.
     * @throws ProblemError `duplicate` when the device id already exists.
     */
    async registerDevice(account: AuthenticatedAccount, body: RegisterDeviceRequest): Promise<Device> {
      const values = {
        id: body.id,
        accountId: account.id,
        label: body.label,
        platform: body.platform,
        wrappedAccountKey: envelopeBytes(body.wrappedAccountKey, 'wrappedAccountKey', 29),
        pairedVia: body.pairedVia,
      };
      try {
        await withContext(db, accountContext(account.id), (tx) => repo.insertDevice(tx, values));
      } catch (error) {
        if (classifyDatabaseError(error).kind === 'unique') {
          throw new ProblemError('duplicate');
        }
        throw error;
      }
      return {
        id: body.id,
        label: body.label,
        platform: body.platform,
        wrappedAccountKey: body.wrappedAccountKey,
        pairedVia: body.pairedVia,
      };
    },

    /**
     * Returns the wrapped account key of one device.
     *
     * @param account - Authenticated account.
     * @param deviceId - Device id.
     * @returns The device.
     * @throws ProblemError `not_found` when the device is not active for this account.
     */
    async getDevice(account: AuthenticatedAccount, deviceId: string): Promise<Device> {
      const row = await withContext(db, accountContext(account.id), (tx) =>
        repo.findDevice(tx, account.id, deviceId),
      );
      if (row === null) {
        throw new ProblemError('not_found');
      }
      if (row.wrappedAccountKey === null) {
        throw new ProblemError('not_found');
      }
      return {
        id: row.id,
        label: row.label,
        platform: row.platform,
        wrappedAccountKey: toBase64Url(row.wrappedAccountKey),
        pairedVia: row.pairedVia,
      };
    },

    /**
     * Checks the recovery verifier and returns the recovery-wrapped keys.
     *
     * Preconditions: `verifier` is the HKDF verifier of the 24-word phrase, not the phrase.
     * Postconditions: a mismatch answers `forbidden` and does not reveal which copy failed.
     *
     * @param account - Authenticated account.
     * @param verifier - Base64url verifier.
     * @param ip - Client address.
     * @returns The recovery public key and the two wrapped copies.
     * @throws ProblemError `forbidden` when the verifier does not match.
     */
    async verifyRecovery(
      account: AuthenticatedAccount,
      verifier: string,
      ip: string | null,
    ): Promise<RecoveryMaterial> {
      await limitRecovery(account.id);
      const material = exactBytes(verifier, 'verifier', 32);
      const row = await withContext(db, accountContext(account.id), async (tx) => {
        const keys = await repo.findKeys(tx, account.id);
        if (keys === null) {
          throw new ProblemError('domain_rule_violated', { detail: 'Account keys are not set' });
        }
        const digest = createHash('sha256').update(material).digest();
        const stored = Buffer.from(keys.recoveryVerifierSha256);
        const matches = digest.length === stored.length && timingSafeEqual(digest, stored);
        if (!matches) {
          return null;
        }
        await repo.recordPinEvent(tx, account.id, 'recovery_used', ip);
        return keys;
      });
      if (row === null) {
        throw new ProblemError('forbidden');
      }
      return {
        recoveryPublicKey: toBase64Url(row.recoveryPublicKey),
        recoveryWrappedPrivateKey: toBase64Url(row.recoveryWrappedPrivateKey),
        recoveryWrappedAccountKey: toBase64Url(row.recoveryWrappedAccountKey),
      };
    },

    /**
     * Returns the salt and the state of the vault code.
     *
     * @param account - Authenticated account.
     * @returns `not_set`, `active` or `locked`, with the attempts still available.
     */
    async getPin(account: AuthenticatedAccount): Promise<VaultPinStatus> {
      const row = await withContext(db, accountContext(account.id), (tx) => repo.findPin(tx, account.id));
      return pinStatus(row);
    },

    /**
     * Sets the vault code for the first time, or changes it while the vault is open.
     *
     * A change re-wraps the same vault private key and leaves the recovery seal untouched.
     *
     * @param account - Authenticated account.
     * @param body - Salt, verifier, server share and wrapped private key.
     * @param sessionId - Session whose vault unlock is required for a change.
     * @param ip - Client address.
     * @returns The new status.
     * @throws ProblemError `vault_locked` when a change is requested with the vault closed.
     */
    async setPin(
      account: AuthenticatedAccount,
      body: SetVaultPinRequest,
      sessionId: string,
      ip: string | null,
    ): Promise<VaultPinStatus> {
      const existing = await withContext(db, accountContext(account.id), (tx) =>
        repo.findPin(tx, account.id),
      );
      if (existing !== null) {
        await requireUnlocked(sessionId);
        return writePin(account.id, body, 'replace', ip);
      }
      return writePin(account.id, body, 'create', ip);
    },

    /**
     * Checks the code verifier and opens a five-minute vault session.
     *
     * Preconditions: the browser derived the verifier with the stored salt. The code is not in `verifier`.
     * Postconditions: success returns the server share once and resets the failure counter.
     * A wrong code answers `pin_invalid` with the attempts left. The fifth wrong code answers `pin_locked`.
     *
     * @param account - Authenticated account.
     * @param verifier - Base64url Argon2id verifier.
     * @param sessionId - Session that will hold the vault unlock.
     * @param ip - Client address.
     * @returns The server share and the moment the session closes.
     */
    async unlock(
      account: AuthenticatedAccount,
      verifier: string,
      sessionId: string,
      ip: string | null,
    ): Promise<UnlockVaultResponse> {
      await limitUnlock(account.id);
      exactBytes(verifier, 'verifier', 32);
      const outcome = await withContext(db, accountContext(account.id), async (tx) => {
        const pin = await repo.lockPin(tx, account.id);
        if (pin === null) {
          return { kind: 'missing' as const };
        }
        if (pin.lockedAt !== null) {
          return { kind: 'locked' as const };
        }
        const matches = await verify(pin.verifierHash, verifier);
        if (!matches) {
          const next = pin.failedAttempts + 1;
          if (next >= MAX_PIN_ATTEMPTS) {
            await repo.lockPinOut(tx, account.id);
            await repo.recordPinEvent(tx, account.id, 'pin_locked', ip);
            return { kind: 'locked' as const };
          }
          await repo.recordFailedAttempt(tx, account.id, next);
          await repo.recordPinEvent(tx, account.id, 'pin_failed', ip);
          return { kind: 'invalid' as const, remaining: MAX_PIN_ATTEMPTS - next };
        }
        await repo.clearPinFailures(tx, account.id);
        const share = await secrets.open(pin.serverShareSealed, { ...SHARE_LOCATION, rowId: account.id });
        return { kind: 'ok' as const, share, pinGeneration: pin.pinGeneration };
      });
      if (outcome.kind === 'missing') {
        throw new ProblemError('domain_rule_violated', { detail: 'The vault code is not set' });
      }
      if (outcome.kind === 'locked') {
        throw new ProblemError('pin_locked', { remainingAttempts: 0 });
      }
      if (outcome.kind === 'invalid') {
        throw new ProblemError('pin_invalid', { remainingAttempts: outcome.remaining });
      }
      const until = new Date(Date.now() + VAULT_SESSION_SECONDS * 1000);
      await store.set(sessionKey(sessionId), '1', VAULT_SESSION_SECONDS);
      return {
        serverShare: toBase64Url(outcome.share),
        unlockedUntil: until.toISOString(),
        pinGeneration: outcome.pinGeneration,
      };
    },

    /**
     * Closes the vault session. The browser discards the keys it held in memory.
     *
     * @param sessionId - Session to close.
     */
    async lock(sessionId: string): Promise<void> {
      await store.delete(sessionKey(sessionId));
    },

    /**
     * Replaces the vault code after the recovery verifier matches, including when the code is locked.
     *
     * The recovery seal and the vault public key stay as they were. Only the wrap and the verifier change.
     *
     * @param account - Authenticated account.
     * @param body - Recovery verifier and the new wrap.
     * @param ip - Client address.
     * @returns The new status (`active`).
     * @throws ProblemError `forbidden` when the recovery verifier does not match.
     */
    async resetPin(
      account: AuthenticatedAccount,
      body: ResetVaultPinRequest,
      ip: string | null,
    ): Promise<VaultPinStatus> {
      await limitRecovery(account.id);
      const material = exactBytes(body.recoveryVerifier, 'recoveryVerifier', 32);
      const salt = exactBytes(body.salt, 'salt', 16);
      exactBytes(body.verifier, 'verifier', 32);
      const share = exactBytes(body.serverShare, 'serverShare', 32);
      const wrapped = envelopeBytes(body.wrappedVaultPrivateKey, 'wrappedVaultPrivateKey', 29);
      if (body.vaultPublicKey !== undefined || body.recoverySealedVaultKey !== undefined) {
        throw new ProblemError('validation_failed', {
          errors: [
            {
              path: 'body.recoverySealedVaultKey',
              code: 'unchanged',
              message: 'A reset does not replace the recovery seal',
            },
          ],
        });
      }
      const verifierHash = await hash(body.verifier, SERVER_PIN_HASH);
      const sealedShare = await sealShare(account.id, share);
      const digest = createHash('sha256').update(material).digest();
      const status = await withContext(db, accountContext(account.id), async (tx) => {
        const keys = await repo.findKeys(tx, account.id);
        const pin = await repo.lockPin(tx, account.id);
        if (keys === null || pin === null || keys.vaultPublicKey === null) {
          throw new ProblemError('domain_rule_violated', { detail: 'The vault code is not set' });
        }
        const stored = Buffer.from(keys.recoveryVerifierSha256);
        if (digest.length !== stored.length || !timingSafeEqual(digest, stored)) {
          return null;
        }
        if (body.pinGeneration !== pin.pinGeneration + 1) {
          throw new ProblemError('domain_rule_violated', { detail: 'The code generation does not match' });
        }
        await repo.replacePin(
          tx,
          account.id,
          { salt, verifierHash, serverShareSealed: sealedShare, pinGeneration: body.pinGeneration },
          wrapped,
        );
        await repo.recordPinEvent(tx, account.id, 'pin_reset', ip);
        return pinStatus(await repo.findPin(tx, account.id));
      });
      if (status === null) {
        throw new ProblemError('forbidden');
      }
      return status;
    },

    /**
     * Returns the family vault scope and this account's grant.
     *
     * @param tenant - Caller in the family.
     * @param sessionId - Open vault session.
     * @returns The scope, or nulls when it has not been created.
     * @throws ProblemError `vault_locked` when the session is closed.
     */
    async getScope(tenant: TenantContext, sessionId: string): Promise<VaultScope> {
      await requireUnlocked(sessionId);
      return withContext(db, familyContext(tenant.accountId, tenant.familyId), async (tx) => {
        const scope = await repo.findVaultScope(tx, tenant.familyId);
        if (scope === null) {
          return { scopeId: null, version: null, grant: null };
        }
        const grant = await repo.findVaultGrant(tx, scope.id, scope.currentVersion, tenant.accountId);
        return {
          scopeId: scope.id,
          version: scope.currentVersion,
          grant: grant === null ? null : toBase64Url(grant.grantBlob),
        };
      });
    },

    /**
     * Creates the family vault scope when it does not exist yet.
     *
     * Preconditions: the vault session is open and `grant` is a `DS-GRANT` for this account's vault key.
     * Postconditions: one `vault_family` scope exists. A later call returns that scope.
     *
     * @param tenant - Caller in the family.
     * @param body - Scope id and grant chosen by the browser.
     * @param sessionId - Open vault session.
     * @returns The scope and the caller's grant.
     */
    async putScope(
      tenant: TenantContext,
      body: PutVaultScopeRequest,
      sessionId: string,
    ): Promise<VaultScope> {
      await requireUnlocked(sessionId);
      const grant = envelopeBytes(body.grant, 'grant', 95);
      try {
        return await withContext(db, familyContext(tenant.accountId, tenant.familyId), async (tx) => {
          const existing = await repo.findVaultScope(tx, tenant.familyId);
          if (existing !== null) {
            const current = await repo.findVaultGrant(
              tx,
              existing.id,
              existing.currentVersion,
              tenant.accountId,
            );
            return {
              scopeId: existing.id,
              version: existing.currentVersion,
              grant: current === null ? null : toBase64Url(current.grantBlob),
            };
          }
          await repo.insertVaultScope(tx, {
            scopeId: body.scopeId,
            familyId: tenant.familyId,
            accountId: tenant.accountId,
            grant,
          });
          await recordAudit(tx, {
            familyId: tenant.familyId,
            actor: { kind: 'account', id: tenant.accountId },
            action: 'vault.scope.created',
            resourceType: 'key_scopes',
            resourceId: body.scopeId,
            outcome: 'success',
          });
          return { scopeId: body.scopeId, version: 1, grant: toBase64Url(grant) };
        });
      } catch (error) {
        if (classifyDatabaseError(error).kind === 'unique') {
          return this.getScope(tenant, sessionId);
        }
        throw error;
      }
    },

    /**
     * Lists ciphertext vault documents.
     *
     * @param tenant - Caller in the family.
     * @param sessionId - Open vault session.
     * @param query - Page and optional section.
     * @returns A page of envelopes. Plaintext is not present.
     */
    async listItems(tenant: TenantContext, sessionId: string, query: VaultListQuery): Promise<VaultItemPage> {
      await requireUnlocked(sessionId);
      const after =
        query.cursor === undefined
          ? undefined
          : (() => {
              const [updatedAt, id] = cursorOf(query.cursor);
              return { updatedAt: new Date(updatedAt), id };
            })();
      const rows = await withContext(db, familyContext(tenant.accountId, tenant.familyId), (tx) =>
        repo.listItems(tx, {
          familyId: tenant.familyId,
          limit: query.limit,
          ...(query.section === undefined ? {} : { section: query.section }),
          ...(after === undefined ? {} : { after }),
        }),
      );
      const page = rows.slice(0, query.limit);
      const last = page.at(-1);
      return {
        items: page.map((row) => itemView(row)),
        nextCursor:
          rows.length > query.limit && last !== undefined
            ? encodeCursor([last.updatedAt.toISOString(), last.id])
            : null,
      };
    },

    /**
     * Stores one encrypted document.
     *
     * @param tenant - Caller in the family.
     * @param body - Section and envelope. The plaintext is not part of the body.
     * @param sessionId - Open vault session.
     * @returns The stored envelope.
     * @throws ProblemError `envelope_invalid` when the scope is not the family vault scope.
     */
    async createItem(
      tenant: TenantContext,
      body: CreateVaultItemRequest,
      sessionId: string,
    ): Promise<VaultItem> {
      await requireUnlocked(sessionId);
      const sealed = readSealed(body.sealed);
      try {
        return await withContext(db, familyContext(tenant.accountId, tenant.familyId), async (tx) => {
          await assertCurrentScope(tx, tenant.familyId, sealed);
          await repo.insertItem(tx, {
            id: body.id,
            familyId: tenant.familyId,
            section: body.section,
            createdBy: tenant.accountId,
            updatedBy: tenant.accountId,
            encScopeId: sealed.scopeId,
            encKeyVersion: sealed.keyVersion,
            encDek: sealed.dek,
            encPayload: sealed.payload,
          });
          await recordRevision(tx, {
            familyId: tenant.familyId,
            resourceType: 'vault_items',
            resourceId: body.id,
            version: 1,
            op: 'create',
            actor: { kind: 'account', id: tenant.accountId },
            data: { section: body.section },
            envelope: sealed,
          });
          await recordAudit(tx, {
            familyId: tenant.familyId,
            actor: { kind: 'account', id: tenant.accountId },
            action: 'vault.item.created',
            resourceType: 'vault_items',
            resourceId: body.id,
            outcome: 'success',
          });
          const row = await repo.findItem(tx, tenant.familyId, body.id);
          if (row === null) {
            throw new Error('Vault item missing after insert');
          }
          return itemView(row);
        });
      } catch (error) {
        if (error instanceof ProblemError) {
          throw error;
        }
        const failure = classifyDatabaseError(error);
        if (failure.kind === 'unique') {
          throw new ProblemError('duplicate');
        }
        if (failure.kind === 'check' || failure.kind === 'foreign_key') {
          throw new ProblemError('envelope_invalid');
        }
        throw error;
      }
    },

    /**
     * Replaces the envelope of one document.
     *
     * @param tenant - Caller in the family.
     * @param itemId - Item id.
     * @param version - Version from `If-Match`.
     * @param body - New envelope.
     * @param sessionId - Open vault session.
     * @returns The updated envelope.
     * @throws ProblemError `version_conflict` when `version` is stale.
     */
    async updateItem(
      tenant: TenantContext,
      itemId: string,
      version: number,
      body: UpdateVaultItemRequest,
      sessionId: string,
    ): Promise<VaultItem> {
      await requireUnlocked(sessionId);
      const sealed = readSealed(body.sealed);
      try {
        return await withContext(db, familyContext(tenant.accountId, tenant.familyId), async (tx) => {
          const current = await repo.findItem(tx, tenant.familyId, itemId);
          if (current?.deletedAt !== null) {
            throw new ProblemError('not_found');
          }
          if (current.version !== version) {
            throw new ProblemError('version_conflict', { currentVersion: current.version });
          }
          await assertCurrentScope(tx, tenant.familyId, sealed);
          const next = current.version + 1;
          await repo.updateItem(tx, tenant.familyId, itemId, {
            version: next,
            updatedBy: tenant.accountId,
            encScopeId: sealed.scopeId,
            encKeyVersion: sealed.keyVersion,
            encDek: sealed.dek,
            encPayload: sealed.payload,
          });
          await recordRevision(tx, {
            familyId: tenant.familyId,
            resourceType: 'vault_items',
            resourceId: itemId,
            version: next,
            op: 'update',
            actor: { kind: 'account', id: tenant.accountId },
            data: { section: current.section },
            envelope: sealed,
          });
          await recordAudit(tx, {
            familyId: tenant.familyId,
            actor: { kind: 'account', id: tenant.accountId },
            action: 'vault.item.updated',
            resourceType: 'vault_items',
            resourceId: itemId,
            outcome: 'success',
          });
          const row = await repo.findItem(tx, tenant.familyId, itemId);
          if (row === null) {
            throw new Error('Vault item missing after update');
          }
          return itemView(row);
        });
      } catch (error) {
        if (error instanceof ProblemError) {
          throw error;
        }
        const failure = classifyDatabaseError(error);
        if (failure.kind === 'check' || failure.kind === 'foreign_key') {
          throw new ProblemError('envelope_invalid');
        }
        throw error;
      }
    },

    /**
     * Moves a document to the trash. The envelope is kept for the revision.
     *
     * @param tenant - Caller in the family.
     * @param itemId - Item id.
     * @param version - Version from `If-Match`.
     * @param sessionId - Open vault session.
     * @throws ProblemError `not_found` when the item is already gone.
     */
    async deleteItem(
      tenant: TenantContext,
      itemId: string,
      version: number,
      sessionId: string,
    ): Promise<void> {
      await requireUnlocked(sessionId);
      await withContext(db, familyContext(tenant.accountId, tenant.familyId), async (tx) => {
        const current = await repo.findItem(tx, tenant.familyId, itemId);
        if (current?.deletedAt !== null) {
          throw new ProblemError('not_found');
        }
        if (current.version !== version) {
          throw new ProblemError('version_conflict', { currentVersion: current.version });
        }
        const next = current.version + 1;
        await repo.updateItem(tx, tenant.familyId, itemId, {
          version: next,
          updatedBy: tenant.accountId,
          encScopeId: current.encScopeId,
          encKeyVersion: current.encKeyVersion,
          encDek: current.encDek,
          encPayload: current.encPayload,
          deletedAt: new Date(),
        });
        await recordRevision(tx, {
          familyId: tenant.familyId,
          resourceType: 'vault_items',
          resourceId: itemId,
          version: next,
          op: 'delete',
          actor: { kind: 'account', id: tenant.accountId },
          data: { section: current.section },
          envelope: {
            scopeId: current.encScopeId,
            keyVersion: current.encKeyVersion,
            dek: current.encDek,
            payload: current.encPayload,
          },
        });
        await recordAudit(tx, {
          familyId: tenant.familyId,
          actor: { kind: 'account', id: tenant.accountId },
          action: 'vault.item.deleted',
          resourceType: 'vault_items',
          resourceId: itemId,
          outcome: 'success',
        });
      });
    },
  };
}

/** Vault service. */
export type VaultService = ReturnType<typeof createVaultService>;

function invalid(path: string, message: string): ProblemError {
  return new ProblemError('validation_failed', {
    errors: [{ path: `body.${path}`, code: 'invalid', message }],
  });
}

function decode(value: string, path: string): Bytes {
  try {
    return fromBase64Url(value);
  } catch {
    throw invalid(path, 'Expected base64url bytes');
  }
}

function exactBytes(value: string, path: string, length: number): Bytes {
  const out = decode(value, path);
  if (out.length !== length) {
    throw invalid(path, `Expected ${String(length)} bytes`);
  }
  return out;
}

function publicKey(value: string, path: string): Bytes {
  const out = exactBytes(value, path, 65);
  if (out[0] !== 4) {
    throw invalid(path, 'Expected an uncompressed P-256 public key');
  }
  return out;
}

function envelopeBytes(value: string, path: string, min: number, max = 262_144): Bytes {
  const out = decode(value, path);
  if (out.length < min || out.length > max || out[0] !== ENVELOPE_VERSION) {
    throw new ProblemError('envelope_invalid');
  }
  return out;
}

function readSealed(sealed: CreateVaultItemRequest['sealed']): {
  readonly scopeId: string;
  readonly keyVersion: number;
  readonly dek: Bytes;
  readonly payload: Bytes;
} {
  return {
    scopeId: sealed.scopeId,
    keyVersion: sealed.keyVersion,
    dek: envelopeBytes(sealed.dek, 'sealed.dek', 29, 4096),
    payload: envelopeBytes(sealed.payload, 'sealed.payload', 29),
  };
}

async function assertCurrentScope(
  tx: Parameters<typeof repo.findVaultScope>[0],
  familyId: string,
  sealed: { readonly scopeId: string; readonly keyVersion: number },
): Promise<void> {
  const scope = await repo.findVaultScope(tx, familyId);
  if (scope?.id !== sealed.scopeId) {
    throw new ProblemError('envelope_invalid');
  }
  if (scope.currentVersion !== sealed.keyVersion) {
    throw new ProblemError('key_version_stale', { currentKeyVersion: scope.currentVersion });
  }
}

function cursorOf(cursor: string): readonly [string, string] {
  const decoded = decodeCursorPair(cursor);
  if (decoded === null) {
    throw new ProblemError('cursor_invalid');
  }
  return decoded;
}

function decodeCursorPair(cursor: string): readonly [string, string] | null {
  try {
    const padded = cursor.replaceAll('-', '+').replaceAll('_', '/');
    const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (
      Array.isArray(value) &&
      value.length === 2 &&
      typeof value[0] === 'string' &&
      typeof value[1] === 'string' &&
      !Number.isNaN(Date.parse(value[0]))
    ) {
      return [value[0], value[1]];
    }
    return null;
  } catch {
    return null;
  }
}
