import { parseVaultPayload, type FamilyVaultSection, type VaultPayload } from '@domusafe/contracts';
import {
  createAccountKeys,
  type AccountKeyBundle,
  type AccountKeySecrets,
  DecryptionError,
  derivePinVerifier,
  deriveRecoveryMaterial,
  fromBase64Url,
  generateDeviceKey,
  generateScopeKey,
  grantScopeKey,
  InvalidRecoveryPhraseError,
  openAccountKeyForDevice,
  openRecord,
  openScopeKeyGrant,
  openVaultPrivateKey,
  openVaultPrivateKeyWithRecovery,
  prepareVaultPin,
  recoverWithPhrase,
  recoveryEntropyFromPhrase,
  sealRecord,
  toBase64Url,
  uuidv7,
  wrapAccountKeyForDevice,
  type Bytes,
} from '@domusafe/crypto';
import { ApiProblem } from '@/lib/api.js';
import type { VaultClient } from './client.js';
import { devicePlatform, type DeviceStore } from './device-store.js';
import { VaultFlowError } from './model.js';

/** Browser Argon2id cost. The type is a literal so it matches the API schema. */
const VAULT_KDF = { memoryKib: 65_536, iterations: 3, parallelism: 1 } as const;

/** Keys created in the browser and not yet uploaded. */
export interface AccountDraft {
  readonly bundle: AccountKeyBundle;
  readonly secrets: AccountKeySecrets;
}

/** A document after it has been decrypted in memory. */
export interface OpenDocument {
  readonly id: string;
  readonly version: number;
  readonly payload: VaultPayload | null;
}

interface OpenMemory {
  readonly scopeId: string;
  readonly scopeVersion: number;
  readonly scopeKey: Bytes;
}

let memory: OpenMemory | null = null;

/**
 * Drops the scope key held in memory.
 *
 * Postconditions: later reads and writes fail until the vault is opened again.
 */
export function clearVaultMemory(): void {
  memory = null;
}

/**
 * Creates a new account key set and its 24-word phrase. Nothing is uploaded yet.
 *
 * @param accountId - Account id bound into the associated data.
 * @returns The bundle to upload after the person confirms the phrase, and the secrets to keep.
 */
export async function draftAccount(accountId: string): Promise<AccountDraft> {
  return createAccountKeys(accountId);
}

/**
 * Picks three word positions the person must retype.
 *
 * @param wordCount - Length of the phrase. Defaults to 24.
 * @returns Sorted zero-based indexes.
 */
export function phraseChecks(wordCount = 24): readonly [number, number, number] {
  const pool = Array.from({ length: wordCount }, (_, index) => index);
  const random = crypto.getRandomValues(new Uint8Array(wordCount));
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swap = (random[index] ?? 0) % (index + 1);
    const current = pool[index] ?? 0;
    pool[index] = pool[swap] ?? 0;
    pool[swap] = current;
  }
  const picked = [pool[0] ?? 0, pool[1] ?? 1, pool[2] ?? 2];
  picked.sort((left, right) => left - right);
  return [picked[0] ?? 0, picked[1] ?? 1, picked[2] ?? 2];
}

/**
 * Compares the retyped words with the phrase.
 *
 * @param words - Phrase split on spaces.
 * @param checks - Positions from `phraseChecks`.
 * @param answers - What the person typed, in the same order.
 * @returns `true` when every answer matches.
 */
export function phraseMatches(
  words: readonly string[],
  checks: readonly number[],
  answers: readonly string[],
): boolean {
  return checks.every((position, index) => {
    const expected = words[position]?.normalize('NFKC').toLocaleLowerCase('it') ?? '';
    const typed = answers[index]?.trim().normalize('NFKC').toLocaleLowerCase('it') ?? '';
    return expected.length > 0 && expected === typed;
  });
}

/**
 * Uploads the account keys and wraps the account key for this browser.
 *
 * Preconditions: the person confirmed three words of `draft.secrets.recoveryPhrase`.
 * Postconditions: the server has the wrapped keys and this browser can open the account key.
 *
 * @param api - Shell API.
 * @param store - Device-key store.
 * @param accountId - Account id.
 * @param draft - Output of `draftAccount`.
 * @param label - Name stored for this browser.
 */
export async function publishAccount(
  api: VaultClient,
  store: DeviceStore,
  accountId: string,
  draft: AccountDraft,
  label: string,
): Promise<void> {
  await api.putKeys(
    {
      publicKey: toBase64Url(draft.bundle.publicKey),
      wrappedPrivateKey: toBase64Url(draft.bundle.wrappedPrivateKey),
      recoveryPublicKey: toBase64Url(draft.bundle.recoveryPublicKey),
      recoveryWrappedPrivateKey: toBase64Url(draft.bundle.recoveryWrappedPrivateKey),
      recoveryWrappedAccountKey: toBase64Url(draft.bundle.recoveryWrappedAccountKey),
      recoveryVerifierSha256: toBase64Url(draft.bundle.recoveryVerifierSha256),
      fingerprint: draft.bundle.fingerprint.join(' '),
    },
    crypto.randomUUID(),
  );
  await saveDevice(api, store, accountId, draft.secrets.accountKey, label, 'signup');
}

/**
 * Opens the account key already wrapped for this browser.
 *
 * @param api - Shell API.
 * @param store - Device-key store.
 * @param accountId - Account id.
 * @returns The account key, or `null` when this browser has not been paired.
 */
export async function loadLocalAccountKey(
  api: VaultClient,
  store: DeviceStore,
  accountId: string,
): Promise<Bytes | null> {
  const local = await store.load();
  if (local === null) {
    return null;
  }
  try {
    const device = await api.getDevice(local.deviceId);
    return await openAccountKeyForDevice(
      local.key,
      fromBase64Url(device.wrappedAccountKey),
      accountId,
      local.deviceId,
    );
  } catch (error) {
    if (error instanceof ApiProblem && error.problem.code === 'not_found') {
      return null;
    }
    if (error instanceof DecryptionError) {
      return null;
    }
    throw error;
  }
}

/**
 * Pairs this browser with the recovery phrase and returns the account key.
 *
 * @param api - Shell API.
 * @param store - Device-key store.
 * @param accountId - Account id.
 * @param phrase - 24 words typed by the person.
 * @param label - Name stored for this browser.
 * @returns The account key, kept only by the caller.
 * @throws VaultFlowError when the phrase is not valid or does not belong to the account.
 */
export async function pairWithPhrase(
  api: VaultClient,
  store: DeviceStore,
  accountId: string,
  phrase: string,
  label: string,
): Promise<Bytes> {
  const recovered = await recoverAccount(api, accountId, phrase);
  await saveDevice(api, store, accountId, recovered.accountKey, label, 'recovery');
  return recovered.accountKey;
}

/**
 * Sets the vault code for the first time and seals the vault key to the recovery key.
 *
 * @param api - Shell API.
 * @param accountId - Account id.
 * @param accountKey - Account key.
 * @param pin - Code chosen by the person. It is not sent.
 * @param recoveryPublicKey - Recovery public key from the account bundle.
 */
export async function setFirstCode(
  api: VaultClient,
  accountId: string,
  accountKey: Bytes,
  pin: string,
  recoveryPublicKey: Bytes,
): Promise<void> {
  const prepared = await prepareVaultPin({
    accountId,
    accountKey,
    pin,
    recoveryPublicKey,
    pinGeneration: 1,
  });
  await api.setVaultPin(
    {
      salt: toBase64Url(prepared.setup.salt),
      kdf: VAULT_KDF,
      verifier: toBase64Url(prepared.setup.verifier),
      serverShare: toBase64Url(prepared.setup.serverShare),
      wrappedVaultPrivateKey: toBase64Url(prepared.setup.wrappedVaultPrivateKey),
      pinGeneration: prepared.setup.pinGeneration,
      vaultPublicKey: toBase64Url(prepared.setup.vaultPublicKey),
      recoverySealedVaultKey: toBase64Url(prepared.setup.recoverySealedVaultKey),
    },
    crypto.randomUUID(),
  );
}

/**
 * Checks the code, opens the vault key and the family scope, and keeps the scope key in memory.
 *
 * @param api - Shell API.
 * @param familyId - Open family.
 * @param accountId - Account id.
 * @param accountKey - Account key.
 * @param pin - Code typed by the person.
 * @throws VaultFlowError `no-grant` when the family scope belongs to someone else.
 */
export async function unlockWithCode(
  api: VaultClient,
  familyId: string,
  accountId: string,
  accountKey: Bytes,
  pin: string,
): Promise<void> {
  const status = await api.getVaultPin();
  if (status.salt === null || status.kdf === null || status.pinGeneration === null) {
    throw new VaultFlowError('no-grant');
  }
  const verifier = await derivePinVerifier(pin, fromBase64Url(status.salt), status.kdf);
  const unlocked = await api.unlockVault(toBase64Url(verifier));
  const keys = await api.getKeys();
  if (keys.state !== 'ready' || keys.wrappedVaultPrivateKey === null || keys.vaultPublicKey === null) {
    throw new VaultFlowError('no-grant');
  }
  const vaultPrivateKey = await openVaultPrivateKey(
    {
      accountId,
      accountKey,
      serverShare: fromBase64Url(unlocked.serverShare),
      wrappedVaultPrivateKey: fromBase64Url(keys.wrappedVaultPrivateKey),
      pinGeneration: unlocked.pinGeneration,
    },
    true,
  );
  const scope = await ensureScope(
    api,
    familyId,
    accountId,
    vaultPrivateKey,
    fromBase64Url(keys.vaultPublicKey),
  );
  memory = scope;
}

/**
 * Closes the server session and drops the scope key.
 *
 * @param api - Shell API.
 */
export async function lockVault(api: VaultClient): Promise<void> {
  clearVaultMemory();
  await api.lockVault();
}

/**
 * Sets a new code with the recovery phrase, then opens the vault.
 *
 * Preconditions: the phrase is the one confirmed when the keys were created.
 * Postconditions: the previous code stops working. The recovery seal is not replaced.
 *
 * @param api - Shell API.
 * @param store - Device-key store.
 * @param familyId - Open family.
 * @param accountId - Account id.
 * @param phrase - 24 words.
 * @param pin - New code.
 * @param label - Name stored if this browser is paired now.
 */
export async function resetWithPhrase(
  api: VaultClient,
  store: DeviceStore,
  familyId: string,
  accountId: string,
  phrase: string,
  pin: string,
  label: string,
): Promise<void> {
  const recovered = await recoverAccount(api, accountId, phrase);
  const keys = await api.getKeys();
  const status = await api.getVaultPin();
  if (
    keys.state !== 'ready' ||
    keys.recoverySealedVaultKey === null ||
    keys.vaultPublicKey === null ||
    status.pinGeneration === null
  ) {
    throw new VaultFlowError('no-grant');
  }
  const vaultPrivateKey = await openVaultPrivateKeyWithRecovery({
    recoveryPrivateKey: recovered.recoveryPrivateKey,
    recoveryPublicKey: fromBase64Url(keys.recoveryPublicKey),
    recoverySealedVaultKey: fromBase64Url(keys.recoverySealedVaultKey),
    accountId,
  });
  const prepared = await prepareVaultPin({
    accountId,
    accountKey: recovered.accountKey,
    pin,
    recoveryPublicKey: fromBase64Url(keys.recoveryPublicKey),
    pinGeneration: status.pinGeneration + 1,
    existingVaultPrivateKey: vaultPrivateKey,
    existingVaultPublicKey: fromBase64Url(keys.vaultPublicKey),
  });
  await api.resetVaultPin(
    {
      salt: toBase64Url(prepared.setup.salt),
      kdf: VAULT_KDF,
      verifier: toBase64Url(prepared.setup.verifier),
      serverShare: toBase64Url(prepared.setup.serverShare),
      wrappedVaultPrivateKey: toBase64Url(prepared.setup.wrappedVaultPrivateKey),
      pinGeneration: prepared.setup.pinGeneration,
      recoveryVerifier: toBase64Url(recovered.verifier),
    },
    crypto.randomUUID(),
  );
  await saveDevice(api, store, accountId, recovered.accountKey, label, 'recovery');
  await unlockWithCode(api, familyId, accountId, recovered.accountKey, pin);
}

/**
 * Decrypts the documents of one section.
 *
 * @param api - Shell API.
 * @param familyId - Open family.
 * @param section - Section to list.
 * @returns Documents. `payload` is null when this device cannot read one of them.
 */
export async function readDocuments(
  api: VaultClient,
  familyId: string,
  section: FamilyVaultSection,
): Promise<OpenDocument[]> {
  const current = requireMemory();
  const items = await api.listVaultItems(familyId, section);
  const documents: OpenDocument[] = [];
  for (const item of items) {
    try {
      const payload = parseVaultPayload(
        section,
        await openRecord({
          table: 'vault_items',
          recordId: item.id,
          version: item.version,
          scopeKey: current.scopeKey,
          sealed: {
            scopeId: item.sealed.scopeId,
            keyVersion: item.sealed.keyVersion,
            dek: fromBase64Url(item.sealed.dek),
            payload: fromBase64Url(item.sealed.payload),
          },
        }),
      );
      documents.push({ id: item.id, version: item.version, payload });
    } catch {
      documents.push({ id: item.id, version: item.version, payload: null });
    }
  }
  return documents;
}

/**
 * Encrypts a document and stores the envelope.
 *
 * @param api - Shell API.
 * @param familyId - Open family.
 * @param section - Section.
 * @param payload - Plaintext validated by the section schema.
 * @param existing - Document being edited. Omit to create one.
 */
export async function saveDocument(
  api: VaultClient,
  familyId: string,
  section: FamilyVaultSection,
  payload: VaultPayload,
  existing?: { readonly id: string; readonly version: number },
): Promise<void> {
  const current = requireMemory();
  const id = existing?.id ?? uuidv7();
  const version = existing === undefined ? 1 : existing.version + 1;
  const sealed = await sealRecord({
    table: 'vault_items',
    recordId: id,
    version,
    scopeId: current.scopeId,
    scopeVersion: current.scopeVersion,
    scopeKey: current.scopeKey,
    payload,
  });
  const envelope = {
    scopeId: sealed.scopeId,
    keyVersion: sealed.keyVersion,
    dek: toBase64Url(sealed.dek),
    payload: toBase64Url(sealed.payload),
  };
  if (existing === undefined) {
    await api.createVaultItem(familyId, { id, section, sealed: envelope }, crypto.randomUUID());
    return;
  }
  await api.updateVaultItem(familyId, id, existing.version, { sealed: envelope });
}

/**
 * Moves a document to the trash.
 *
 * @param api - Shell API.
 * @param familyId - Open family.
 * @param itemId - Document id.
 * @param version - Version the screen loaded.
 */
export async function removeDocument(
  api: VaultClient,
  familyId: string,
  itemId: string,
  version: number,
): Promise<void> {
  requireMemory();
  await api.deleteVaultItem(familyId, itemId, version);
}

function requireMemory(): OpenMemory {
  if (memory === null) {
    throw new VaultFlowError('no-grant');
  }
  return memory;
}

async function recoverAccount(api: VaultClient, accountId: string, phrase: string) {
  let entropy: Bytes;
  try {
    entropy = recoveryEntropyFromPhrase(phrase);
  } catch (error) {
    if (error instanceof InvalidRecoveryPhraseError) {
      throw new VaultFlowError('phrase');
    }
    throw error;
  }
  const material = await deriveRecoveryMaterial(entropy);
  let wrapped;
  try {
    wrapped = await api.verifyRecovery(toBase64Url(material.verifier));
  } catch (error) {
    if (error instanceof ApiProblem && error.problem.code === 'forbidden') {
      throw new VaultFlowError('phrase-wrong');
    }
    throw error;
  }
  return recoverWithPhrase(
    phrase,
    {
      recoveryWrappedAccountKey: fromBase64Url(wrapped.recoveryWrappedAccountKey),
      recoveryWrappedPrivateKey: fromBase64Url(wrapped.recoveryWrappedPrivateKey),
    },
    accountId,
  );
}

async function saveDevice(
  api: VaultClient,
  store: DeviceStore,
  accountId: string,
  accountKey: Bytes,
  label: string,
  pairedVia: 'signup' | 'recovery',
): Promise<void> {
  const deviceKey = await generateDeviceKey();
  const deviceId = uuidv7();
  const wrapped = await wrapAccountKeyForDevice(deviceKey, accountKey, accountId, deviceId);
  await api.registerDevice(
    {
      id: deviceId,
      label,
      platform: devicePlatform(),
      wrappedAccountKey: toBase64Url(wrapped),
      pairedVia,
    },
    crypto.randomUUID(),
  );
  await store.save({ deviceId, key: deviceKey });
}

async function ensureScope(
  api: VaultClient,
  familyId: string,
  accountId: string,
  privateKey: CryptoKey,
  publicKey: Bytes,
): Promise<OpenMemory> {
  const existing = await api.getVaultScope(familyId);
  if (existing.scopeId === null) {
    const scopeId = uuidv7();
    const scopeKey = generateScopeKey();
    const grant = await grantScopeKey({
      scopeId,
      version: 1,
      scopeKey,
      grantee: 'vault',
      granteeId: accountId,
      granteePublicKey: publicKey,
    });
    const created = await api.putVaultScope(
      familyId,
      { scopeId, grant: toBase64Url(grant) },
      crypto.randomUUID(),
    );
    if (created.scopeId !== scopeId || created.version === null) {
      throw new VaultFlowError('no-grant');
    }
    return { scopeId, scopeVersion: created.version, scopeKey };
  }
  if (existing.grant === null || existing.version === null) {
    throw new VaultFlowError('no-grant');
  }
  const scopeKey = await openScopeKeyGrant({
    grantBlob: fromBase64Url(existing.grant),
    scopeId: existing.scopeId,
    version: existing.version,
    grantee: 'vault',
    granteeId: accountId,
    privateKey,
    publicKey,
  });
  return { scopeId: existing.scopeId, scopeVersion: existing.version, scopeKey };
}
