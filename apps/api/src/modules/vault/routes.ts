import { isIP } from 'node:net';
import {
  accountKeysResponseSchema,
  createVaultItemRequestSchema,
  deviceParamsSchema,
  deviceSchema,
  familyParamsSchema,
  formatEtag,
  putAccountKeysRequestSchema,
  putVaultScopeRequestSchema,
  recoveryMaterialSchema,
  registerDeviceRequestSchema,
  resetVaultPinRequestSchema,
  setVaultPinRequestSchema,
  unlockVaultRequestSchema,
  unlockVaultResponseSchema,
  updateVaultItemRequestSchema,
  vaultItemPageSchema,
  vaultItemParamsSchema,
  vaultItemSchema,
  vaultListQuerySchema,
  vaultPinStatusSchema,
  vaultScopeSchema,
  verifyRecoveryRequestSchema,
} from '@domusafe/contracts';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  idempotencyHeaders,
  ifMatchHeaders,
  problemResponses,
  requireIfMatch,
} from '../../http/conventions.js';
import { ProblemError } from '../../http/problem.js';
import type { AuthenticatedAccount, TenantContext } from '../../types.js';
import type { VaultService } from './service.js';

function caller(request: { account: AuthenticatedAccount | null }): AuthenticatedAccount {
  if (request.account === null) {
    throw new ProblemError('unauthenticated');
  }
  return request.account;
}

function tenantOf(request: { tenant: TenantContext | null }): TenantContext {
  if (request.tenant === null) {
    throw new ProblemError('not_found');
  }
  return request.tenant;
}

function clientIp(ip: string): string | null {
  return isIP(ip) === 0 ? null : ip;
}

/**
 * Routes of the family vault. The code and the documents' plaintext are never accepted.
 *
 * @param app - Fastify instance with the Zod type provider.
 * @param options - Vault service.
 */
export const vaultRoutes: FastifyPluginAsyncZod<{ vault: VaultService }> = async (app, { vault }) => {
  app.get(
    '/api/v1/me/keys',
    {
      config: { access: 'account' },
      schema: {
        tags: ['vault'],
        operationId: 'vault.getKeys',
        summary: 'Wrapped account keys, without the recovery copies',
        response: { 200: accountKeysResponseSchema, ...problemResponses(401) },
      },
    },
    async (request) => vault.getKeys(caller(request)),
  );

  app.put(
    '/api/v1/me/keys',
    {
      config: { access: 'account', idempotent: true },
      schema: {
        tags: ['vault'],
        operationId: 'vault.putKeys',
        summary: 'Store the account keys once, after the recovery phrase is confirmed',
        headers: idempotencyHeaders,
        body: putAccountKeysRequestSchema,
        response: { 200: accountKeysResponseSchema, ...problemResponses(400, 401, 409, 422) },
      },
    },
    async (request) => vault.putKeys(caller(request), request.body),
  );

  app.post(
    '/api/v1/me/devices',
    {
      config: { access: 'account', idempotent: true },
      schema: {
        tags: ['vault'],
        operationId: 'vault.registerDevice',
        summary: 'Register a device and the account key wrapped for it',
        headers: idempotencyHeaders,
        body: registerDeviceRequestSchema,
        response: { 201: deviceSchema, ...problemResponses(400, 401, 409, 422) },
      },
    },
    async (request, reply) => {
      const device = await vault.registerDevice(caller(request), request.body);
      return reply.status(201).send(device);
    },
  );

  app.get(
    '/api/v1/me/devices/:deviceId',
    {
      config: { access: 'account' },
      schema: {
        tags: ['vault'],
        operationId: 'vault.getDevice',
        summary: 'Wrapped account key of one device',
        params: deviceParamsSchema,
        response: { 200: deviceSchema, ...problemResponses(401, 404) },
      },
    },
    async (request) => vault.getDevice(caller(request), request.params.deviceId),
  );

  app.post(
    '/api/v1/me/recovery/verify',
    {
      config: { access: 'account' },
      schema: {
        tags: ['vault'],
        operationId: 'vault.verifyRecovery',
        summary: 'Return the recovery-wrapped keys after the phrase verifier matches',
        body: verifyRecoveryRequestSchema,
        response: { 200: recoveryMaterialSchema, ...problemResponses(400, 401, 403, 422, 429) },
      },
    },
    async (request) => vault.verifyRecovery(caller(request), request.body.verifier, clientIp(request.ip)),
  );

  app.get(
    '/api/v1/me/vault-pin',
    {
      config: { access: 'account' },
      schema: {
        tags: ['vault'],
        operationId: 'vault.getPin',
        summary: 'Salt, cost and state of the vault code',
        response: { 200: vaultPinStatusSchema, ...problemResponses(401) },
      },
    },
    async (request) => vault.getPin(caller(request)),
  );

  app.put(
    '/api/v1/me/vault-pin',
    {
      config: { access: 'account', idempotent: true },
      schema: {
        tags: ['vault'],
        operationId: 'vault.setPin',
        summary: 'Set or change the vault code',
        headers: idempotencyHeaders,
        body: setVaultPinRequestSchema,
        response: { 200: vaultPinStatusSchema, ...problemResponses(400, 401, 409, 422, 423) },
      },
    },
    async (request) =>
      vault.setPin(caller(request), request.body, caller(request).sessionId, clientIp(request.ip)),
  );

  app.post(
    '/api/v1/me/vault-pin/unlock',
    {
      config: { access: 'account' },
      schema: {
        tags: ['vault'],
        operationId: 'vault.unlock',
        summary: 'Check the code verifier and open the vault session',
        body: unlockVaultRequestSchema,
        response: { 200: unlockVaultResponseSchema, ...problemResponses(400, 401, 422, 423, 429) },
      },
    },
    async (request) =>
      vault.unlock(caller(request), request.body.verifier, caller(request).sessionId, clientIp(request.ip)),
  );

  app.post(
    '/api/v1/me/vault-pin/lock',
    {
      config: { access: 'account' },
      schema: {
        tags: ['vault'],
        operationId: 'vault.lock',
        summary: 'Close the vault session',
        response: { 204: z.null(), ...problemResponses(401) },
      },
    },
    async (request, reply) => {
      await vault.lock(caller(request).sessionId);
      return reply.status(204).send(null);
    },
  );

  app.post(
    '/api/v1/me/vault-pin/reset',
    {
      config: { access: 'account', idempotent: true },
      schema: {
        tags: ['vault'],
        operationId: 'vault.resetPin',
        summary: 'Set a new vault code with the recovery verifier',
        headers: idempotencyHeaders,
        body: resetVaultPinRequestSchema,
        response: { 200: vaultPinStatusSchema, ...problemResponses(400, 401, 403, 422, 429) },
      },
    },
    async (request) => vault.resetPin(caller(request), request.body, clientIp(request.ip)),
  );

  app.get(
    '/api/v1/families/:familyId/vault/scope',
    {
      config: { access: 'family', permission: 'vault.family.read', planFeature: 'vault_family' },
      schema: {
        tags: ['vault'],
        operationId: 'vault.getScope',
        summary: 'Family vault scope and the caller grant',
        params: familyParamsSchema,
        response: { 200: vaultScopeSchema, ...problemResponses(401, 403, 404, 423) },
      },
    },
    async (request) => vault.getScope(tenantOf(request), caller(request).sessionId),
  );

  app.put(
    '/api/v1/families/:familyId/vault/scope',
    {
      config: {
        access: 'family',
        permission: 'vault.family.write',
        planFeature: 'vault_family',
        idempotent: true,
      },
      schema: {
        tags: ['vault'],
        operationId: 'vault.putScope',
        summary: 'Create the family vault scope and grant, once',
        params: familyParamsSchema,
        headers: idempotencyHeaders,
        body: putVaultScopeRequestSchema,
        response: { 200: vaultScopeSchema, ...problemResponses(400, 401, 403, 404, 422, 423) },
      },
    },
    async (request) => vault.putScope(tenantOf(request), request.body, caller(request).sessionId),
  );

  app.get(
    '/api/v1/families/:familyId/vault/items',
    {
      config: { access: 'family', permission: 'vault.family.read', planFeature: 'vault_family' },
      schema: {
        tags: ['vault'],
        operationId: 'vault.listItems',
        summary: 'Ciphertext of the family vault documents',
        params: familyParamsSchema,
        querystring: vaultListQuerySchema,
        response: { 200: vaultItemPageSchema, ...problemResponses(400, 401, 403, 404, 423) },
      },
    },
    async (request) => vault.listItems(tenantOf(request), caller(request).sessionId, request.query),
  );

  app.post(
    '/api/v1/families/:familyId/vault/items',
    {
      config: {
        access: 'family',
        permission: 'vault.family.write',
        planFeature: 'vault_family',
        idempotent: true,
      },
      schema: {
        tags: ['vault'],
        operationId: 'vault.createItem',
        summary: 'Store one encrypted family document',
        params: familyParamsSchema,
        headers: idempotencyHeaders,
        body: createVaultItemRequestSchema,
        response: { 201: vaultItemSchema, ...problemResponses(400, 401, 403, 404, 409, 422, 423) },
      },
    },
    async (request, reply) => {
      const item = await vault.createItem(tenantOf(request), request.body, caller(request).sessionId);
      return reply
        .status(201)
        .header('etag', formatEtag(item.version))
        .header('location', `/api/v1/families/${tenantOf(request).familyId}/vault/items/${item.id}`)
        .send(item);
    },
  );

  app.patch(
    '/api/v1/families/:familyId/vault/items/:itemId',
    {
      config: { access: 'family', permission: 'vault.family.write', planFeature: 'vault_family' },
      schema: {
        tags: ['vault'],
        operationId: 'vault.updateItem',
        summary: 'Replace the envelope of one family document',
        params: vaultItemParamsSchema,
        headers: ifMatchHeaders,
        body: updateVaultItemRequestSchema,
        response: { 200: vaultItemSchema, ...problemResponses(400, 401, 403, 404, 409, 423, 428) },
      },
    },
    async (request, reply) => {
      const item = await vault.updateItem(
        tenantOf(request),
        request.params.itemId,
        requireIfMatch(request),
        request.body,
        caller(request).sessionId,
      );
      return reply.header('etag', formatEtag(item.version)).send(item);
    },
  );

  app.delete(
    '/api/v1/families/:familyId/vault/items/:itemId',
    {
      config: { access: 'family', permission: 'vault.family.write', planFeature: 'vault_family' },
      schema: {
        tags: ['vault'],
        operationId: 'vault.deleteItem',
        summary: 'Move one family document to the trash',
        params: vaultItemParamsSchema,
        headers: ifMatchHeaders,
        response: { 204: z.null(), ...problemResponses(401, 403, 404, 409, 423, 428) },
      },
    },
    async (request, reply) => {
      await vault.deleteItem(
        tenantOf(request),
        request.params.itemId,
        requireIfMatch(request),
        caller(request).sessionId,
      );
      return reply.status(204).send(null);
    },
  );
};
