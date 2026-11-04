import {
  createFamilyRequestSchema,
  createHouseRequestSchema,
  familyListSchema,
  familyParamsSchema,
  familySchema,
  formatEtag,
  houseParamsSchema,
  housePageSchema,
  houseSchema,
  membershipPageSchema,
  membershipParamsSchema,
  membershipSchema,
  pageQuerySchema,
  updateFamilyRequestSchema,
  updateHouseRequestSchema,
  updateMembershipRequestSchema,
} from '@domusafe/contracts';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  idempotencyHeaders,
  ifMatchHeaders,
  instantCursor,
  numericCursor,
  problemResponses,
  requireIfMatch,
} from '../../http/conventions.js';
import { ProblemError } from '../../http/problem.js';
import type { AuthenticatedAccount, TenantContext } from '../../types.js';
import type { TenancyService } from './service.js';

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

const createdFamilySchema = z
  .object({ family: familySchema, house: houseSchema })
  .strict()
  .meta({ id: 'CreatedFamily' });

/**
 * Routes of the `tenancy` module: families, houses and members (phase 3 §5.4).
 *
 * @param app - Fastify instance with the Zod type provider.
 * @param options - Tenancy service.
 */
export const tenancyRoutes: FastifyPluginAsyncZod<{ tenancy: TenancyService }> = async (app, { tenancy }) => {
  app.get(
    '/api/v1/families',
    {
      config: { access: 'account' },
      schema: {
        tags: ['tenancy'],
        operationId: 'tenancy.listFamilies',
        summary: 'Families of the current account',
        response: { 200: familyListSchema, ...problemResponses(401) },
      },
    },
    async (request) => ({
      items: (await tenancy.listFamilies(caller(request).id)).map((family) => ({
        id: family.id,
        name: family.name,
        ownerAccountId: family.ownerAccountId,
        timezone: family.timezone,
        baseCurrency: family.baseCurrency,
        locale: family.locale,
        plan: family.plan,
        role: family.role,
        version: family.version,
        createdAt: family.createdAt,
        updatedAt: family.updatedAt,
      })),
    }),
  );

  app.post(
    '/api/v1/families',
    {
      config: { access: 'account', idempotent: true },
      schema: {
        tags: ['tenancy'],
        operationId: 'tenancy.createFamily',
        summary: 'Create a family owned by the current account, with its first house',
        headers: idempotencyHeaders,
        body: createFamilyRequestSchema,
        response: { 201: createdFamilySchema, ...problemResponses(400, 401, 409, 422) },
      },
    },
    async (request, reply) => {
      const created = await tenancy.createFamily(caller(request), request.body);
      void reply
        .status(201)
        .header('location', `/api/v1/families/${created.family.id}`)
        .header('etag', formatEtag(created.family.version));
      return created;
    },
  );

  app.get(
    '/api/v1/families/:familyId',
    {
      config: { access: 'family', permission: 'family.read' },
      schema: {
        tags: ['tenancy'],
        operationId: 'tenancy.getFamily',
        summary: 'Family with role and effective plan',
        params: familyParamsSchema,
        response: { 200: familySchema, ...problemResponses(401, 403, 404) },
      },
    },
    async (request, reply) => {
      const family = await tenancy.getFamily(tenantOf(request));
      void reply.header('etag', formatEtag(family.version));
      return family;
    },
  );

  app.patch(
    '/api/v1/families/:familyId',
    {
      config: { access: 'family', permission: 'family.manage' },
      schema: {
        tags: ['tenancy'],
        operationId: 'tenancy.updateFamily',
        summary: 'Update name, time zone, base currency or language',
        params: familyParamsSchema,
        headers: ifMatchHeaders,
        body: updateFamilyRequestSchema,
        response: { 200: familySchema, ...problemResponses(400, 401, 403, 404, 409, 428) },
      },
    },
    async (request, reply) => {
      const family = await tenancy.updateFamily(tenantOf(request), requireIfMatch(request), request.body);
      void reply.header('etag', formatEtag(family.version));
      return family;
    },
  );

  app.get(
    '/api/v1/families/:familyId/houses',
    {
      config: { access: 'family', permission: 'houses.read' },
      schema: {
        tags: ['tenancy'],
        operationId: 'tenancy.listHouses',
        summary: 'Houses visible to the current member',
        params: familyParamsSchema,
        querystring: pageQuerySchema,
        response: { 200: housePageSchema, ...problemResponses(400, 401, 403, 404) },
      },
    },
    async (request) =>
      tenancy.listHouses(tenantOf(request), {
        limit: request.query.limit,
        after: numericCursor(request.query.cursor),
      }),
  );

  app.post(
    '/api/v1/families/:familyId/houses',
    {
      config: { access: 'family', permission: 'houses.manage', idempotent: true },
      schema: {
        tags: ['tenancy'],
        operationId: 'tenancy.createHouse',
        summary: 'Add a house within the plan limit',
        params: familyParamsSchema,
        headers: idempotencyHeaders,
        body: createHouseRequestSchema,
        response: { 201: houseSchema, ...problemResponses(400, 401, 403, 404, 409, 422) },
      },
    },
    async (request, reply) => {
      const house = await tenancy.createHouse(tenantOf(request), request.body);
      void reply
        .status(201)
        .header('location', `/api/v1/families/${house.familyId}/houses/${house.id}`)
        .header('etag', formatEtag(house.version));
      return house;
    },
  );

  app.get(
    '/api/v1/families/:familyId/houses/:houseId',
    {
      config: { access: 'family', permission: 'houses.read' },
      schema: {
        tags: ['tenancy'],
        operationId: 'tenancy.getHouse',
        summary: 'One house',
        params: houseParamsSchema,
        response: { 200: houseSchema, ...problemResponses(401, 403, 404) },
      },
    },
    async (request, reply) => {
      const house = await tenancy.getHouse(tenantOf(request), request.params.houseId);
      void reply.header('etag', formatEtag(house.version));
      return house;
    },
  );

  app.patch(
    '/api/v1/families/:familyId/houses/:houseId',
    {
      config: { access: 'family', permission: 'houses.manage' },
      schema: {
        tags: ['tenancy'],
        operationId: 'tenancy.updateHouse',
        summary: 'Update a house',
        params: houseParamsSchema,
        headers: ifMatchHeaders,
        body: updateHouseRequestSchema,
        response: { 200: houseSchema, ...problemResponses(400, 401, 403, 404, 409, 428) },
      },
    },
    async (request, reply) => {
      const house = await tenancy.updateHouse(
        tenantOf(request),
        request.params.houseId,
        requireIfMatch(request),
        request.body,
      );
      void reply.header('etag', formatEtag(house.version));
      return house;
    },
  );

  app.delete(
    '/api/v1/families/:familyId/houses/:houseId',
    {
      config: { access: 'family', permission: 'houses.manage' },
      schema: {
        tags: ['tenancy'],
        operationId: 'tenancy.deleteHouse',
        summary: 'Move a house to the trash (30 days)',
        params: houseParamsSchema,
        headers: ifMatchHeaders,
        response: { 204: z.null(), ...problemResponses(401, 403, 404, 409, 422, 428) },
      },
    },
    async (request, reply) => {
      await tenancy.deleteHouse(tenantOf(request), request.params.houseId, requireIfMatch(request));
      return reply.status(204).send(null);
    },
  );

  app.get(
    '/api/v1/families/:familyId/members',
    {
      config: { access: 'family', permission: 'members.read' },
      schema: {
        tags: ['tenancy'],
        operationId: 'tenancy.listMembers',
        summary: 'Members with role and scope',
        params: familyParamsSchema,
        querystring: pageQuerySchema,
        response: { 200: membershipPageSchema, ...problemResponses(400, 401, 403, 404) },
      },
    },
    async (request) =>
      tenancy.listMembers(tenantOf(request), {
        limit: request.query.limit,
        after: instantCursor(request.query.cursor),
      }),
  );

  app.patch(
    '/api/v1/families/:familyId/members/:membershipId',
    {
      config: { access: 'family', permission: 'members.manage' },
      schema: {
        tags: ['tenancy'],
        operationId: 'tenancy.updateMember',
        summary: 'Change role, scope, expiry or family-vault concession',
        params: membershipParamsSchema,
        headers: ifMatchHeaders,
        body: updateMembershipRequestSchema,
        response: { 200: membershipSchema, ...problemResponses(400, 401, 403, 404, 409, 422, 428) },
      },
    },
    async (request, reply) => {
      const member = await tenancy.updateMember(
        tenantOf(request),
        request.params.membershipId,
        requireIfMatch(request),
        request.body,
      );
      void reply.header('etag', formatEtag(member.version));
      return member;
    },
  );

  app.delete(
    '/api/v1/families/:familyId/members/:membershipId',
    {
      config: { access: 'family', permission: 'members.manage' },
      schema: {
        tags: ['tenancy'],
        operationId: 'tenancy.removeMember',
        summary: 'Remove a member and schedule key rotation',
        params: membershipParamsSchema,
        headers: ifMatchHeaders,
        response: { 204: z.null(), ...problemResponses(401, 403, 404, 409, 422, 428) },
      },
    },
    async (request, reply) => {
      await tenancy.removeMember(tenantOf(request), request.params.membershipId, requireIfMatch(request));
      return reply.status(204).send(null);
    },
  );
};
