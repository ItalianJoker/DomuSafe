import {
  choreCompletionListQuerySchema,
  choreCompletionPageSchema,
  choreCompletionParamsSchema,
  choreCompletionSchema,
  choreListQuerySchema,
  chorePageSchema,
  choreParamsSchema,
  choreSchema,
  createChoreCompletionRequestSchema,
  createChoreRequestSchema,
  createPointEntryRequestSchema,
  createRedemptionRequestSchema,
  createRewardRequestSchema,
  familyParamsSchema,
  formatEtag,
  pointEntrySchema,
  pointsQuerySchema,
  pointsViewSchema,
  redemptionListQuerySchema,
  redemptionParamsSchema,
  rewardListQuerySchema,
  rewardPageSchema,
  rewardParamsSchema,
  rewardRedemptionPageSchema,
  rewardRedemptionSchema,
  rewardSchema,
  updateChoreRequestSchema,
  updateRewardRequestSchema,
} from '@domusafe/contracts';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  idempotencyHeaders,
  ifMatchHeaders,
  instantCursor,
  problemResponses,
  requireIfMatch,
} from '../../http/conventions.js';
import { ProblemError } from '../../http/problem.js';
import type { TenantContext } from '../../types.js';
import type { RewardsService } from './service.js';

function tenantOf(request: { tenant: TenantContext | null }): TenantContext {
  if (request.tenant === null) {
    throw new ProblemError('not_found');
  }
  return request.tenant;
}

/**
 * Routes of family chores, points, streaks and the rewards store.
 * Permissions follow `chores.*` and `rewards.*`. No plan feature gate — Free includes them.
 *
 * @param app - Fastify instance with the Zod type provider.
 * @param options - Rewards service.
 */
export const rewardsRoutes: FastifyPluginAsyncZod<{ rewards: RewardsService }> = async (app, { rewards }) => {
  const family = '/api/v1/families/:familyId';
  const choresPath = `${family}/chores`;
  const completionsPath = `${family}/chore-completions`;
  const pointsPath = `${family}/points`;
  const rewardsPath = `${family}/rewards`;
  const redemptionsPath = `${family}/redemptions`;

  app.get(
    choresPath,
    {
      config: { access: 'family', permission: 'chores.complete' },
      schema: {
        tags: ['rewards'],
        operationId: 'rewards.listChores',
        summary: 'List family chores',
        params: familyParamsSchema,
        querystring: choreListQuerySchema,
        response: { 200: chorePageSchema, ...problemResponses(400, 401, 403, 404) },
      },
    },
    async (request) =>
      rewards.listChores(tenantOf(request), {
        limit: request.query.limit,
        after: instantCursor(request.query.cursor),
        houseId: request.query.houseId,
        active: request.query.active,
      }),
  );

  app.post(
    choresPath,
    {
      config: { access: 'family', permission: 'chores.manage', idempotent: true },
      schema: {
        tags: ['rewards'],
        operationId: 'rewards.createChore',
        summary: 'Create a family chore',
        params: familyParamsSchema,
        headers: idempotencyHeaders,
        body: createChoreRequestSchema,
        response: { 201: choreSchema, ...problemResponses(400, 401, 403, 404, 409, 422) },
      },
    },
    async (request, reply) => {
      const tenant = tenantOf(request);
      const row = await rewards.createChore(tenant, request.body);
      void reply
        .status(201)
        .header('location', `/api/v1/families/${tenant.familyId}/chores/${row.id}`)
        .header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.get(
    `${choresPath}/:choreId`,
    {
      config: { access: 'family', permission: 'chores.complete' },
      schema: {
        tags: ['rewards'],
        operationId: 'rewards.getChore',
        summary: 'Get one family chore',
        params: choreParamsSchema,
        response: { 200: choreSchema, ...problemResponses(401, 403, 404) },
      },
    },
    async (request, reply) => {
      const row = await rewards.getChore(tenantOf(request), request.params.choreId);
      void reply.header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.patch(
    `${choresPath}/:choreId`,
    {
      config: { access: 'family', permission: 'chores.manage' },
      schema: {
        tags: ['rewards'],
        operationId: 'rewards.updateChore',
        summary: 'Update a family chore',
        params: choreParamsSchema,
        headers: ifMatchHeaders,
        body: updateChoreRequestSchema,
        response: { 200: choreSchema, ...problemResponses(400, 401, 403, 404, 409, 422, 428) },
      },
    },
    async (request, reply) => {
      const row = await rewards.updateChore(
        tenantOf(request),
        request.params.choreId,
        requireIfMatch(request),
        request.body,
      );
      void reply.header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.delete(
    `${choresPath}/:choreId`,
    {
      config: { access: 'family', permission: 'chores.manage' },
      schema: {
        tags: ['rewards'],
        operationId: 'rewards.deleteChore',
        summary: 'Soft-delete a family chore',
        params: choreParamsSchema,
        headers: ifMatchHeaders,
        response: { 204: z.null(), ...problemResponses(401, 403, 404, 409, 428) },
      },
    },
    async (request, reply) => {
      await rewards.deleteChore(tenantOf(request), request.params.choreId, requireIfMatch(request));
      void reply.status(204);
      return null;
    },
  );

  app.post(
    `${choresPath}/:choreId/completions`,
    {
      config: { access: 'family', permission: 'chores.complete', idempotent: true },
      schema: {
        tags: ['rewards'],
        operationId: 'rewards.completeChore',
        summary: 'Mark a chore as completed',
        params: choreParamsSchema,
        headers: idempotencyHeaders,
        body: createChoreCompletionRequestSchema,
        response: { 201: choreCompletionSchema, ...problemResponses(400, 401, 403, 404, 409, 422) },
      },
    },
    async (request, reply) => {
      const tenant = tenantOf(request);
      const row = await rewards.completeChore(tenant, request.params.choreId, request.body);
      void reply
        .status(201)
        .header('location', `/api/v1/families/${tenant.familyId}/chore-completions/${row.id}`);
      return row;
    },
  );

  app.get(
    completionsPath,
    {
      config: { access: 'family', permission: 'rewards.read' },
      schema: {
        tags: ['rewards'],
        operationId: 'rewards.listCompletions',
        summary: 'List chore completions',
        params: familyParamsSchema,
        querystring: choreCompletionListQuerySchema,
        response: { 200: choreCompletionPageSchema, ...problemResponses(400, 401, 403, 404) },
      },
    },
    async (request) =>
      rewards.listCompletions(tenantOf(request), {
        limit: request.query.limit,
        after: instantCursor(request.query.cursor),
        choreId: request.query.choreId,
        residentId: request.query.residentId,
        status: request.query.status,
      }),
  );

  app.post(
    `${completionsPath}/:completionId/approve`,
    {
      config: { access: 'family', permission: 'rewards.approve', idempotent: true },
      schema: {
        tags: ['rewards'],
        operationId: 'rewards.approveCompletion',
        summary: 'Approve a chore completion and award points',
        params: choreCompletionParamsSchema,
        headers: idempotencyHeaders,
        response: { 200: choreCompletionSchema, ...problemResponses(401, 403, 404, 409, 422) },
      },
    },
    async (request) => rewards.approveCompletion(tenantOf(request), request.params.completionId),
  );

  app.post(
    `${completionsPath}/:completionId/reject`,
    {
      config: { access: 'family', permission: 'rewards.approve', idempotent: true },
      schema: {
        tags: ['rewards'],
        operationId: 'rewards.rejectCompletion',
        summary: 'Reject a chore completion',
        params: choreCompletionParamsSchema,
        headers: idempotencyHeaders,
        response: { 200: choreCompletionSchema, ...problemResponses(401, 403, 404, 409, 422) },
      },
    },
    async (request) => rewards.rejectCompletion(tenantOf(request), request.params.completionId),
  );

  app.get(
    pointsPath,
    {
      config: { access: 'family', permission: 'rewards.read' },
      schema: {
        tags: ['rewards'],
        operationId: 'rewards.getPoints',
        summary: 'Point balance, streak and ledger of one resident',
        params: familyParamsSchema,
        querystring: pointsQuerySchema,
        response: { 200: pointsViewSchema, ...problemResponses(400, 401, 403, 404) },
      },
    },
    async (request) =>
      rewards.getPoints(tenantOf(request), {
        residentId: request.query.residentId,
        limit: request.query.limit,
        after: instantCursor(request.query.cursor),
      }),
  );

  app.post(
    pointsPath,
    {
      config: { access: 'family', permission: 'rewards.adjust', idempotent: true },
      schema: {
        tags: ['rewards'],
        operationId: 'rewards.adjustPoints',
        summary: 'Manually adjust a resident point balance',
        params: familyParamsSchema,
        headers: idempotencyHeaders,
        body: createPointEntryRequestSchema,
        response: { 201: pointEntrySchema, ...problemResponses(400, 401, 403, 404, 409, 422) },
      },
    },
    async (request, reply) => {
      const tenant = tenantOf(request);
      const row = await rewards.adjustPoints(tenant, request.body);
      void reply.status(201).header('location', `/api/v1/families/${tenant.familyId}/points`);
      return row;
    },
  );

  app.get(
    rewardsPath,
    {
      config: { access: 'family', permission: 'rewards.read' },
      schema: {
        tags: ['rewards'],
        operationId: 'rewards.listRewards',
        summary: 'List items in the rewards store',
        params: familyParamsSchema,
        querystring: rewardListQuerySchema,
        response: { 200: rewardPageSchema, ...problemResponses(400, 401, 403, 404) },
      },
    },
    async (request) =>
      rewards.listRewards(tenantOf(request), {
        limit: request.query.limit,
        after: instantCursor(request.query.cursor),
        active: request.query.active,
      }),
  );

  app.post(
    rewardsPath,
    {
      config: { access: 'family', permission: 'rewards.manage', idempotent: true },
      schema: {
        tags: ['rewards'],
        operationId: 'rewards.createReward',
        summary: 'Add an item to the rewards store',
        params: familyParamsSchema,
        headers: idempotencyHeaders,
        body: createRewardRequestSchema,
        response: { 201: rewardSchema, ...problemResponses(400, 401, 403, 404, 409, 422) },
      },
    },
    async (request, reply) => {
      const tenant = tenantOf(request);
      const row = await rewards.createReward(tenant, request.body);
      void reply
        .status(201)
        .header('location', `/api/v1/families/${tenant.familyId}/rewards/${row.id}`)
        .header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.patch(
    `${rewardsPath}/:rewardId`,
    {
      config: { access: 'family', permission: 'rewards.manage' },
      schema: {
        tags: ['rewards'],
        operationId: 'rewards.updateReward',
        summary: 'Update a rewards store item',
        params: rewardParamsSchema,
        headers: ifMatchHeaders,
        body: updateRewardRequestSchema,
        response: { 200: rewardSchema, ...problemResponses(400, 401, 403, 404, 409, 422, 428) },
      },
    },
    async (request, reply) => {
      const row = await rewards.updateReward(
        tenantOf(request),
        request.params.rewardId,
        requireIfMatch(request),
        request.body,
      );
      void reply.header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.delete(
    `${rewardsPath}/:rewardId`,
    {
      config: { access: 'family', permission: 'rewards.manage' },
      schema: {
        tags: ['rewards'],
        operationId: 'rewards.deleteReward',
        summary: 'Soft-delete a rewards store item',
        params: rewardParamsSchema,
        headers: ifMatchHeaders,
        response: { 204: z.null(), ...problemResponses(401, 403, 404, 409, 428) },
      },
    },
    async (request, reply) => {
      await rewards.deleteReward(tenantOf(request), request.params.rewardId, requireIfMatch(request));
      void reply.status(204);
      return null;
    },
  );

  app.post(
    `${rewardsPath}/:rewardId/redemptions`,
    {
      config: { access: 'family', permission: 'rewards.request', idempotent: true },
      schema: {
        tags: ['rewards'],
        operationId: 'rewards.requestRedemption',
        summary: 'Request to redeem a reward for points',
        params: rewardParamsSchema,
        headers: idempotencyHeaders,
        body: createRedemptionRequestSchema,
        response: { 201: rewardRedemptionSchema, ...problemResponses(400, 401, 403, 404, 409, 422) },
      },
    },
    async (request, reply) => {
      const tenant = tenantOf(request);
      const row = await rewards.requestRedemption(tenant, request.params.rewardId, request.body);
      void reply
        .status(201)
        .header('location', `/api/v1/families/${tenant.familyId}/redemptions/${row.id}`)
        .header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.get(
    redemptionsPath,
    {
      config: { access: 'family', permission: 'rewards.read' },
      schema: {
        tags: ['rewards'],
        operationId: 'rewards.listRedemptions',
        summary: 'List reward redemption requests',
        params: familyParamsSchema,
        querystring: redemptionListQuerySchema,
        response: { 200: rewardRedemptionPageSchema, ...problemResponses(400, 401, 403, 404) },
      },
    },
    async (request) =>
      rewards.listRedemptions(tenantOf(request), {
        limit: request.query.limit,
        after: instantCursor(request.query.cursor),
        residentId: request.query.residentId,
        status: request.query.status,
      }),
  );

  app.post(
    `${redemptionsPath}/:redemptionId/approve`,
    {
      config: { access: 'family', permission: 'rewards.approve', idempotent: true },
      schema: {
        tags: ['rewards'],
        operationId: 'rewards.approveRedemption',
        summary: 'Approve a reward redemption and debit points',
        params: redemptionParamsSchema,
        headers: idempotencyHeaders.and(ifMatchHeaders),
        response: { 200: rewardRedemptionSchema, ...problemResponses(401, 403, 404, 409, 422, 428) },
      },
    },
    async (request, reply) => {
      const row = await rewards.approveRedemption(
        tenantOf(request),
        request.params.redemptionId,
        requireIfMatch(request),
      );
      void reply.header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.post(
    `${redemptionsPath}/:redemptionId/reject`,
    {
      config: { access: 'family', permission: 'rewards.approve', idempotent: true },
      schema: {
        tags: ['rewards'],
        operationId: 'rewards.rejectRedemption',
        summary: 'Reject a reward redemption',
        params: redemptionParamsSchema,
        headers: idempotencyHeaders.and(ifMatchHeaders),
        response: { 200: rewardRedemptionSchema, ...problemResponses(401, 403, 404, 409, 422, 428) },
      },
    },
    async (request, reply) => {
      const row = await rewards.rejectRedemption(
        tenantOf(request),
        request.params.redemptionId,
        requireIfMatch(request),
      );
      void reply.header('etag', formatEtag(row.version));
      return row;
    },
  );

  app.post(
    `${redemptionsPath}/:redemptionId/fulfill`,
    {
      config: { access: 'family', permission: 'rewards.approve', idempotent: true },
      schema: {
        tags: ['rewards'],
        operationId: 'rewards.fulfillRedemption',
        summary: 'Mark an approved redemption as fulfilled',
        params: redemptionParamsSchema,
        headers: idempotencyHeaders.and(ifMatchHeaders),
        response: { 200: rewardRedemptionSchema, ...problemResponses(401, 403, 404, 409, 422, 428) },
      },
    },
    async (request, reply) => {
      const row = await rewards.fulfillRedemption(
        tenantOf(request),
        request.params.redemptionId,
        requireIfMatch(request),
      );
      void reply.header('etag', formatEtag(row.version));
      return row;
    },
  );
};
