import {
  HEADERS,
  PROBLEM_TITLES,
  accountKeysResponseSchema,
  deviceSchema,
  formatEtag,
  problemDetailsSchema,
  problemType,
  recoveryMaterialSchema,
  unlockVaultResponseSchema,
  vaultItemPageSchema,
  vaultItemSchema,
  vaultPinStatusSchema,
  vaultScopeSchema,
  type AccountKeysResponse,
  type CreateVaultItemRequest,
  type Device,
  type FamilyVaultSection,
  type ProblemDetails,
  type PutAccountKeysRequest,
  type PutVaultScopeRequest,
  type RecoveryMaterial,
  type RegisterDeviceRequest,
  type ResetVaultPinRequest,
  type SetVaultPinRequest,
  type UnlockVaultResponse,
  type UpdateVaultItemRequest,
  type VaultItem,
  type VaultPinStatus,
  type VaultScope,
} from '@domusafe/contracts';
import createClient, { type Middleware } from 'openapi-fetch';
import type { components, paths } from '@/lib/api.generated.js';
import { ApiProblem } from '@/lib/api.js';

/**
 * Browser calls that read and write only vault ciphertext and key wraps.
 *
 * Preconditions: the page origin is trusted by the API.
 * Postconditions: mutations send the anti-forgery header. Plaintext never leaves this module.
 */
export interface VaultClient {
  /** Wrapped account keys, or `missing` before the recovery phrase is confirmed. */
  getKeys(): Promise<AccountKeysResponse>;
  /**
   * Stores the account keys once.
   *
   * @param body - Wrapped keys. The phrase is not included.
   * @param idempotencyKey - UUID for this attempt.
   */
  putKeys(body: PutAccountKeysRequest, idempotencyKey: string): Promise<AccountKeysResponse>;
  /**
   * Registers this browser.
   *
   * @param body - Device id and the wrapped account key.
   * @param idempotencyKey - UUID for this attempt.
   */
  registerDevice(body: RegisterDeviceRequest, idempotencyKey: string): Promise<Device>;
  /**
   * Reads the wrapped account key of one device.
   *
   * @param deviceId - Device id.
   */
  getDevice(deviceId: string): Promise<Device>;
  /**
   * Exchanges a recovery verifier for the recovery-wrapped keys.
   *
   * @param verifier - Base64url verifier of the phrase.
   */
  verifyRecovery(verifier: string): Promise<RecoveryMaterial>;
  /** Salt and state of the vault code. */
  getVaultPin(): Promise<VaultPinStatus>;
  /**
   * Sets or changes the vault code.
   *
   * @param body - Verifier, salt and wrapped key.
   * @param idempotencyKey - UUID for this attempt.
   */
  setVaultPin(body: SetVaultPinRequest, idempotencyKey: string): Promise<VaultPinStatus>;
  /**
   * Opens the vault session.
   *
   * @param verifier - Base64url verifier of the code.
   */
  unlockVault(verifier: string): Promise<UnlockVaultResponse>;
  /** Closes the vault session. */
  lockVault(): Promise<void>;
  /**
   * Sets a new code with the recovery verifier.
   *
   * @param body - Recovery verifier and the new wrap.
   * @param idempotencyKey - UUID for this attempt.
   */
  resetVaultPin(body: ResetVaultPinRequest, idempotencyKey: string): Promise<VaultPinStatus>;
  /**
   * Family vault scope and this account's grant.
   *
   * @param familyId - Family id.
   */
  getVaultScope(familyId: string): Promise<VaultScope>;
  /**
   * Creates the family vault scope once.
   *
   * @param familyId - Family id.
   * @param body - Scope id and grant.
   * @param idempotencyKey - UUID for this attempt.
   */
  putVaultScope(familyId: string, body: PutVaultScopeRequest, idempotencyKey: string): Promise<VaultScope>;
  /**
   * Ciphertext documents of one section.
   *
   * @param familyId - Family id.
   * @param section - Family section.
   */
  listVaultItems(familyId: string, section: FamilyVaultSection): Promise<readonly VaultItem[]>;
  /**
   * Stores one encrypted document.
   *
   * @param familyId - Family id.
   * @param body - Section and envelope.
   * @param idempotencyKey - UUID for this attempt.
   */
  createVaultItem(familyId: string, body: CreateVaultItemRequest, idempotencyKey: string): Promise<VaultItem>;
  /**
   * Replaces one envelope.
   *
   * @param familyId - Family id.
   * @param itemId - Item id.
   * @param version - Version the form was loaded with.
   * @param body - New envelope.
   */
  updateVaultItem(
    familyId: string,
    itemId: string,
    version: number,
    body: UpdateVaultItemRequest,
  ): Promise<VaultItem>;
  /**
   * Moves one document to the trash.
   *
   * @param familyId - Family id.
   * @param itemId - Item id.
   * @param version - Version the form was loaded with.
   */
  deleteVaultItem(familyId: string, itemId: string, version: number): Promise<void>;
}

/** Options of {@link createVaultClient}. */
export interface VaultClientOptions {
  /** Origin of the API. Empty uses the page origin. */
  readonly baseUrl?: string;
  /** Fetch implementation. The browser default keeps the session cookie. */
  readonly fetch?: typeof globalThis.fetch;
  /** Language sent as `Accept-Language`. Defaults to Italian. */
  readonly locale?: () => 'it' | 'en';
}

interface CallResult {
  readonly data?: unknown;
  readonly error?: unknown;
  readonly response: Response;
}

function unexpected(status: number): ProblemDetails {
  return {
    type: problemType('internal_error'),
    title: PROBLEM_TITLES.internal_error.it,
    status,
    code: 'internal_error',
    requestId: '',
  };
}

function toProblem(error: unknown, response: Response): ApiProblem {
  const parsed = problemDetailsSchema.safeParse(error);
  if (parsed.success) {
    return new ApiProblem(parsed.data);
  }
  return new ApiProblem(unexpected(response.status));
}

async function collect<T>(
  load: (cursor: string | undefined) => Promise<{ items: T[]; nextCursor: string | null }>,
): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | undefined;
  do {
    const page = await load(cursor);
    items.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor !== undefined);
  return items;
}

async function unwrap<T>(schema: { parse: (data: unknown) => T }, result: CallResult): Promise<T> {
  if (result.response.ok) {
    return schema.parse(result.data);
  }
  throw toProblem(result.error, result.response);
}

/**
 * Builds the vault client. It is loaded with the Cassaforte screen, not with the app shell.
 *
 * @param options - Base URL, fetch and language.
 * @returns Calls for keys, the code and ciphertext documents.
 */
export function createVaultClient(options: VaultClientOptions = {}): VaultClient {
  const locale = options.locale ?? (() => 'it' as const);
  const client = createClient<paths>({
    baseUrl: options.baseUrl ?? '',
    credentials: 'include',
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  });
  const middleware: Middleware = {
    onRequest({ request }) {
      const headers = new Headers(request.headers);
      const method = request.method.toUpperCase();
      if (method !== 'GET' && method !== 'HEAD') {
        headers.set(HEADERS.csrf, '1');
      }
      headers.set('accept-language', locale());
      return new Request(request, { headers });
    },
  };
  client.use(middleware);

  return {
    async getKeys() {
      return unwrap(accountKeysResponseSchema, await client.GET('/api/v1/me/keys'));
    },
    async putKeys(body, idempotencyKey) {
      return unwrap(
        accountKeysResponseSchema,
        await client.PUT('/api/v1/me/keys', {
          body,
          headers: { [HEADERS.idempotencyKey]: idempotencyKey },
        }),
      );
    },
    async registerDevice(body, idempotencyKey) {
      return unwrap(
        deviceSchema,
        await client.POST('/api/v1/me/devices', {
          body,
          headers: { [HEADERS.idempotencyKey]: idempotencyKey },
        }),
      );
    },
    async getDevice(deviceId) {
      return unwrap(
        deviceSchema,
        await client.GET('/api/v1/me/devices/{deviceId}', { params: { path: { deviceId } } }),
      );
    },
    async verifyRecovery(verifier) {
      return unwrap(
        recoveryMaterialSchema,
        await client.POST('/api/v1/me/recovery/verify', { body: { verifier } }),
      );
    },
    async getVaultPin() {
      return unwrap(vaultPinStatusSchema, await client.GET('/api/v1/me/vault-pin'));
    },
    async setVaultPin(body, idempotencyKey) {
      return unwrap(
        vaultPinStatusSchema,
        await client.PUT('/api/v1/me/vault-pin', {
          body: body as components['schemas']['SetVaultPinRequestInput'],
          headers: { [HEADERS.idempotencyKey]: idempotencyKey },
        }),
      );
    },
    async unlockVault(verifier) {
      return unwrap(
        unlockVaultResponseSchema,
        await client.POST('/api/v1/me/vault-pin/unlock', { body: { verifier } }),
      );
    },
    async lockVault() {
      const result = await client.POST('/api/v1/me/vault-pin/lock');
      if (!result.response.ok) {
        throw toProblem(result.error, result.response);
      }
    },
    async resetVaultPin(body, idempotencyKey) {
      return unwrap(
        vaultPinStatusSchema,
        await client.POST('/api/v1/me/vault-pin/reset', {
          body: body as components['schemas']['ResetVaultPinRequestInput'],
          headers: { [HEADERS.idempotencyKey]: idempotencyKey },
        }),
      );
    },
    async getVaultScope(familyId) {
      return unwrap(
        vaultScopeSchema,
        await client.GET('/api/v1/families/{familyId}/vault/scope', { params: { path: { familyId } } }),
      );
    },
    async putVaultScope(familyId, body, idempotencyKey) {
      return unwrap(
        vaultScopeSchema,
        await client.PUT('/api/v1/families/{familyId}/vault/scope', {
          params: { path: { familyId } },
          body,
          headers: { [HEADERS.idempotencyKey]: idempotencyKey },
        }),
      );
    },
    listVaultItems(familyId, section) {
      return collect((cursor) =>
        client
          .GET('/api/v1/families/{familyId}/vault/items', {
            params: {
              path: { familyId },
              query: { limit: 200, section, ...(cursor === undefined ? {} : { cursor }) },
            },
          })
          .then((result) => unwrap(vaultItemPageSchema, result)),
      );
    },
    async createVaultItem(familyId, body, idempotencyKey) {
      return unwrap(
        vaultItemSchema,
        await client.POST('/api/v1/families/{familyId}/vault/items', {
          params: { path: { familyId } },
          body,
          headers: { [HEADERS.idempotencyKey]: idempotencyKey },
        }),
      );
    },
    async updateVaultItem(familyId, itemId, version, body) {
      return unwrap(
        vaultItemSchema,
        await client.PATCH('/api/v1/families/{familyId}/vault/items/{itemId}', {
          params: { path: { familyId, itemId } },
          body,
          headers: { [HEADERS.ifMatch]: formatEtag(version) },
        }),
      );
    },
    async deleteVaultItem(familyId, itemId, version) {
      const result = await client.DELETE('/api/v1/families/{familyId}/vault/items/{itemId}', {
        params: { path: { familyId, itemId } },
        headers: { [HEADERS.ifMatch]: formatEtag(version) },
      });
      if (!result.response.ok) {
        throw toProblem(result.error, result.response);
      }
    },
  };
}
