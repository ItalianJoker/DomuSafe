import {
  bankAccountPageSchema,
  bankAccountParamsSchema,
  createBankAccountRequestSchema,
  createPetRequestSchema,
  createPhoneLineRequestSchema,
  createResidentRequestSchema,
  createSubscriptionRequestSchema,
  createVehicleRequestSchema,
  familyParamsSchema,
  formatEtag,
  generateTaxChecklistRequestSchema,
  houseParamsSchema,
  personalBankAccountSchema,
  petPageSchema,
  petParamsSchema,
  petSchema,
  phoneLinePageSchema,
  phoneLineParamsSchema,
  phoneLineSchema,
  putRescueRequestSchema,
  replaceResidentHousesRequestSchema,
  rescueCardSchema,
  rescueSheetSchema,
  residentListQuerySchema,
  residentPageSchema,
  residentParamsSchema,
  residentSchema,
  residentScopedListQuerySchema,
  petListQuerySchema,
  subscriptionPageSchema,
  subscriptionParamsSchema,
  subscriptionSchema,
  taxChecklistItemSchema,
  taxChecklistSchema,
  taxItemParamsSchema,
  taxListQuerySchema,
  updateBankAccountRequestSchema,
  updatePetRequestSchema,
  updatePhoneLineRequestSchema,
  updateResidentRequestSchema,
  updateSubscriptionRequestSchema,
  updateTaxItemRequestSchema,
  updateVehicleRequestSchema,
  vehiclePageSchema,
  vehicleParamsSchema,
  vehicleSchema,
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
import type { TenantContext } from '../../types.js';
import type { PersonaleService } from './service.js';

function tenantOf(request: { tenant: TenantContext | null }): TenantContext {
  if (request.tenant === null) {
    throw new ProblemError('not_found');
  }
  return request.tenant;
}

/**
 * Routes of Personale: residents, the readable rescue card, pets, personal services,
 * bank-account metadata and the annual tax checklist.
 * Tax items and bank accounts require Premium (`taxes` and `vault_personal`), which the trial satisfies.
 *
 * @param app - Fastify instance with the Zod type provider.
 * @param options - Personale service.
 */
export const personaleRoutes: FastifyPluginAsyncZod<{ personale: PersonaleService }> = async (
  app,
  { personale },
) => {
  const residents = '/api/v1/families/:familyId/residents';
  const one = `${residents}/:residentId`;

  app.get(
    residents,
    {
      config: { access: 'family', permission: 'residents.read' },
      schema: {
        tags: ['personale'],
        operationId: 'personale.listResidents',
        summary: 'People of the family, optionally those who live in one house',
        params: familyParamsSchema,
        querystring: residentListQuerySchema,
        response: { 200: residentPageSchema, ...problemResponses(400, 401, 403, 404) },
      },
    },
    async (request) =>
      personale.listResidents(tenantOf(request), {
        limit: request.query.limit,
        after: numericCursor(request.query.cursor),
        ...(request.query.houseId === undefined ? {} : { houseId: request.query.houseId }),
      }),
  );

  app.post(
    residents,
    {
      config: { access: 'family', permission: 'residents.write', idempotent: true },
      schema: {
        tags: ['personale'],
        operationId: 'personale.createResident',
        summary: 'Add a person and an empty rescue card',
        params: familyParamsSchema,
        headers: idempotencyHeaders,
        body: createResidentRequestSchema,
        response: { 201: residentSchema, ...problemResponses(400, 401, 403, 404, 409, 422) },
      },
    },
    async (request, reply) => {
      const tenant = tenantOf(request);
      const resident = await personale.createResident(tenant, request.body);
      void reply
        .status(201)
        .header('location', `${residents.replace(':familyId', tenant.familyId)}/${resident.id}`)
        .header('etag', formatEtag(resident.version));
      return resident;
    },
  );

  app.get(
    one,
    {
      config: { access: 'family', permission: 'residents.read' },
      schema: {
        tags: ['personale'],
        operationId: 'personale.getResident',
        summary: 'One person',
        params: residentParamsSchema,
        response: { 200: residentSchema, ...problemResponses(401, 403, 404) },
      },
    },
    async (request, reply) => {
      const resident = await personale.getResident(tenantOf(request), request.params.residentId);
      void reply.header('etag', formatEtag(resident.version));
      return resident;
    },
  );

  app.patch(
    one,
    {
      config: { access: 'family', permission: 'residents.write' },
      schema: {
        tags: ['personale'],
        operationId: 'personale.updateResident',
        summary: 'Update the identity of a person',
        params: residentParamsSchema,
        headers: ifMatchHeaders,
        body: updateResidentRequestSchema,
        response: { 200: residentSchema, ...problemResponses(400, 401, 403, 404, 409, 422, 428) },
      },
    },
    async (request, reply) => {
      const resident = await personale.updateResident(
        tenantOf(request),
        request.params.residentId,
        requireIfMatch(request),
        request.body,
      );
      void reply.header('etag', formatEtag(resident.version));
      return resident;
    },
  );

  app.delete(
    one,
    {
      config: { access: 'family', permission: 'residents.write' },
      schema: {
        tags: ['personale'],
        operationId: 'personale.deleteResident',
        summary: 'Move a person to the trash',
        params: residentParamsSchema,
        headers: ifMatchHeaders,
        response: { 204: z.null(), ...problemResponses(401, 403, 404, 409, 428) },
      },
    },
    async (request, reply) => {
      await personale.deleteResident(tenantOf(request), request.params.residentId, requireIfMatch(request));
      return reply.status(204).send(null);
    },
  );

  app.put(
    `${one}/houses`,
    {
      config: { access: 'family', permission: 'residents.write' },
      schema: {
        tags: ['personale'],
        operationId: 'personale.replaceResidentHouses',
        summary: 'Replace the houses a person lives in',
        params: residentParamsSchema,
        headers: ifMatchHeaders,
        body: replaceResidentHousesRequestSchema,
        response: { 200: residentSchema, ...problemResponses(400, 401, 403, 404, 409, 422, 428) },
      },
    },
    async (request, reply) => {
      const resident = await personale.replaceHouses(
        tenantOf(request),
        request.params.residentId,
        requireIfMatch(request),
        request.body,
      );
      void reply.header('etag', formatEtag(resident.version));
      return resident;
    },
  );

  app.get(
    `${one}/rescue`,
    {
      config: { access: 'family', permission: 'health.read' },
      schema: {
        tags: ['personale'],
        operationId: 'personale.getRescue',
        summary: 'Readable rescue card of one person',
        params: residentParamsSchema,
        response: { 200: rescueCardSchema, ...problemResponses(401, 403, 404) },
      },
    },
    async (request, reply) => {
      const card = await personale.getRescue(tenantOf(request), request.params.residentId);
      void reply.header('etag', formatEtag(card.version));
      return card;
    },
  );

  app.put(
    `${one}/rescue`,
    {
      config: { access: 'family', permission: 'health.write' },
      schema: {
        tags: ['personale'],
        operationId: 'personale.putRescue',
        summary: 'Replace the rescue card, medicines and ordered contacts',
        params: residentParamsSchema,
        headers: ifMatchHeaders,
        body: putRescueRequestSchema,
        response: { 200: rescueCardSchema, ...problemResponses(400, 401, 403, 404, 409, 422, 428) },
      },
    },
    async (request, reply) => {
      const card = await personale.putRescue(
        tenantOf(request),
        request.params.residentId,
        requireIfMatch(request),
        request.body,
      );
      void reply.header('etag', formatEtag(card.version));
      return card;
    },
  );

  app.get(
    '/api/v1/families/:familyId/houses/:houseId/rescue-sheet',
    {
      config: { access: 'family', permission: 'health.read' },
      schema: {
        tags: ['personale'],
        operationId: 'personale.getRescueSheet',
        summary: 'Readable rescue sheet of the people and animals of one house',
        params: houseParamsSchema,
        response: { 200: rescueSheetSchema, ...problemResponses(401, 403, 404) },
      },
    },
    async (request) => personale.getRescueSheet(tenantOf(request), request.params.houseId),
  );

  const pets = '/api/v1/families/:familyId/pets';
  app.get(
    pets,
    {
      config: { access: 'family', permission: 'pets.read' },
      schema: {
        tags: ['personale'],
        operationId: 'personale.listPets',
        summary: 'Animals of the family',
        params: familyParamsSchema,
        querystring: petListQuerySchema,
        response: { 200: petPageSchema, ...problemResponses(400, 401, 403, 404) },
      },
    },
    async (request) =>
      personale.listPets(tenantOf(request), {
        limit: request.query.limit,
        after: instantCursor(request.query.cursor),
        ...(request.query.houseId === undefined ? {} : { houseId: request.query.houseId }),
      }),
  );

  app.post(
    pets,
    {
      config: { access: 'family', permission: 'pets.write', idempotent: true },
      schema: {
        tags: ['personale'],
        operationId: 'personale.createPet',
        summary: 'Add an animal and its veterinary clinic',
        params: familyParamsSchema,
        headers: idempotencyHeaders,
        body: createPetRequestSchema,
        response: { 201: petSchema, ...problemResponses(400, 401, 403, 404, 409, 422) },
      },
    },
    async (request, reply) => {
      const pet = await personale.createPet(tenantOf(request), request.body);
      void reply.status(201).header('etag', formatEtag(pet.version));
      return pet;
    },
  );

  app.patch(
    `${pets}/:petId`,
    {
      config: { access: 'family', permission: 'pets.write' },
      schema: {
        tags: ['personale'],
        operationId: 'personale.updatePet',
        summary: 'Update an animal',
        params: petParamsSchema,
        headers: ifMatchHeaders,
        body: updatePetRequestSchema,
        response: { 200: petSchema, ...problemResponses(400, 401, 403, 404, 409, 422, 428) },
      },
    },
    async (request, reply) => {
      const pet = await personale.updatePet(
        tenantOf(request),
        request.params.petId,
        requireIfMatch(request),
        request.body,
      );
      void reply.header('etag', formatEtag(pet.version));
      return pet;
    },
  );

  app.delete(
    `${pets}/:petId`,
    {
      config: { access: 'family', permission: 'pets.write' },
      schema: {
        tags: ['personale'],
        operationId: 'personale.deletePet',
        summary: 'Move an animal to the trash',
        params: petParamsSchema,
        headers: ifMatchHeaders,
        response: { 204: z.null(), ...problemResponses(401, 403, 404, 409, 428) },
      },
    },
    async (request, reply) => {
      await personale.deletePet(tenantOf(request), request.params.petId, requireIfMatch(request));
      return reply.status(204).send(null);
    },
  );

  const lines = `${one}/phone-lines`;
  app.get(
    lines,
    {
      config: { access: 'family', permission: 'residents.read' },
      schema: {
        tags: ['personale'],
        operationId: 'personale.listPhoneLines',
        summary: 'Mobile plans of a person',
        params: residentParamsSchema,
        querystring: residentScopedListQuerySchema,
        response: { 200: phoneLinePageSchema, ...problemResponses(400, 401, 403, 404) },
      },
    },
    async (request) =>
      personale.listPhoneLines(tenantOf(request), request.params.residentId, {
        limit: request.query.limit,
        after: instantCursor(request.query.cursor),
      }),
  );

  app.post(
    lines,
    {
      config: { access: 'family', permission: 'residents.write', idempotent: true },
      schema: {
        tags: ['personale'],
        operationId: 'personale.createPhoneLine',
        summary: 'Add a mobile plan',
        params: residentParamsSchema,
        headers: idempotencyHeaders,
        body: createPhoneLineRequestSchema,
        response: { 201: phoneLineSchema, ...problemResponses(400, 401, 403, 404, 409, 422) },
      },
    },
    async (request, reply) => {
      const line = await personale.createPhoneLine(
        tenantOf(request),
        request.params.residentId,
        request.body,
      );
      void reply.status(201).header('etag', formatEtag(line.version));
      return line;
    },
  );

  app.patch(
    `${lines}/:phoneLineId`,
    {
      config: { access: 'family', permission: 'residents.write' },
      schema: {
        tags: ['personale'],
        operationId: 'personale.updatePhoneLine',
        summary: 'Update a mobile plan',
        params: phoneLineParamsSchema,
        headers: ifMatchHeaders,
        body: updatePhoneLineRequestSchema,
        response: { 200: phoneLineSchema, ...problemResponses(400, 401, 403, 404, 409, 422, 428) },
      },
    },
    async (request, reply) => {
      const line = await personale.updatePhoneLine(
        tenantOf(request),
        request.params.residentId,
        request.params.phoneLineId,
        requireIfMatch(request),
        request.body,
      );
      void reply.header('etag', formatEtag(line.version));
      return line;
    },
  );

  app.delete(
    `${lines}/:phoneLineId`,
    {
      config: { access: 'family', permission: 'residents.write' },
      schema: {
        tags: ['personale'],
        operationId: 'personale.deletePhoneLine',
        summary: 'Move a mobile plan to the trash',
        params: phoneLineParamsSchema,
        headers: ifMatchHeaders,
        response: { 204: z.null(), ...problemResponses(401, 403, 404, 409, 428) },
      },
    },
    async (request, reply) => {
      await personale.deletePhoneLine(
        tenantOf(request),
        request.params.residentId,
        request.params.phoneLineId,
        requireIfMatch(request),
      );
      return reply.status(204).send(null);
    },
  );

  const subs = `${one}/subscriptions`;
  app.get(
    subs,
    {
      config: { access: 'family', permission: 'residents.read' },
      schema: {
        tags: ['personale'],
        operationId: 'personale.listSubscriptions',
        summary: 'Personal subscriptions of a person',
        params: residentParamsSchema,
        querystring: residentScopedListQuerySchema,
        response: { 200: subscriptionPageSchema, ...problemResponses(400, 401, 403, 404) },
      },
    },
    async (request) =>
      personale.listSubscriptions(tenantOf(request), request.params.residentId, {
        limit: request.query.limit,
        after: instantCursor(request.query.cursor),
      }),
  );

  app.post(
    subs,
    {
      config: { access: 'family', permission: 'residents.write', idempotent: true },
      schema: {
        tags: ['personale'],
        operationId: 'personale.createSubscription',
        summary: 'Add a personal subscription',
        params: residentParamsSchema,
        headers: idempotencyHeaders,
        body: createSubscriptionRequestSchema,
        response: { 201: subscriptionSchema, ...problemResponses(400, 401, 403, 404, 409, 422) },
      },
    },
    async (request, reply) => {
      const item = await personale.createSubscription(
        tenantOf(request),
        request.params.residentId,
        request.body,
      );
      void reply.status(201).header('etag', formatEtag(item.version));
      return item;
    },
  );

  app.patch(
    `${subs}/:subscriptionId`,
    {
      config: { access: 'family', permission: 'residents.write' },
      schema: {
        tags: ['personale'],
        operationId: 'personale.updateSubscription',
        summary: 'Update a personal subscription',
        params: subscriptionParamsSchema,
        headers: ifMatchHeaders,
        body: updateSubscriptionRequestSchema,
        response: { 200: subscriptionSchema, ...problemResponses(400, 401, 403, 404, 409, 422, 428) },
      },
    },
    async (request, reply) => {
      const item = await personale.updateSubscription(
        tenantOf(request),
        request.params.residentId,
        request.params.subscriptionId,
        requireIfMatch(request),
        request.body,
      );
      void reply.header('etag', formatEtag(item.version));
      return item;
    },
  );

  app.delete(
    `${subs}/:subscriptionId`,
    {
      config: { access: 'family', permission: 'residents.write' },
      schema: {
        tags: ['personale'],
        operationId: 'personale.deleteSubscription',
        summary: 'Move a personal subscription to the trash',
        params: subscriptionParamsSchema,
        headers: ifMatchHeaders,
        response: { 204: z.null(), ...problemResponses(401, 403, 404, 409, 428) },
      },
    },
    async (request, reply) => {
      await personale.deleteSubscription(
        tenantOf(request),
        request.params.residentId,
        request.params.subscriptionId,
        requireIfMatch(request),
      );
      return reply.status(204).send(null);
    },
  );

  const cars = `${one}/vehicles`;
  app.get(
    cars,
    {
      config: { access: 'family', permission: 'residents.read' },
      schema: {
        tags: ['personale'],
        operationId: 'personale.listVehicles',
        summary: 'Vehicles of a person',
        params: residentParamsSchema,
        querystring: residentScopedListQuerySchema,
        response: { 200: vehiclePageSchema, ...problemResponses(400, 401, 403, 404) },
      },
    },
    async (request) =>
      personale.listVehicles(tenantOf(request), request.params.residentId, {
        limit: request.query.limit,
        after: instantCursor(request.query.cursor),
      }),
  );

  app.post(
    cars,
    {
      config: { access: 'family', permission: 'residents.write', idempotent: true },
      schema: {
        tags: ['personale'],
        operationId: 'personale.createVehicle',
        summary: 'Add a vehicle and its deadlines',
        params: residentParamsSchema,
        headers: idempotencyHeaders,
        body: createVehicleRequestSchema,
        response: { 201: vehicleSchema, ...problemResponses(400, 401, 403, 404, 409, 422) },
      },
    },
    async (request, reply) => {
      const vehicle = await personale.createVehicle(
        tenantOf(request),
        request.params.residentId,
        request.body,
      );
      void reply.status(201).header('etag', formatEtag(vehicle.version));
      return vehicle;
    },
  );

  app.patch(
    `${cars}/:vehicleId`,
    {
      config: { access: 'family', permission: 'residents.write' },
      schema: {
        tags: ['personale'],
        operationId: 'personale.updateVehicle',
        summary: 'Update a vehicle',
        params: vehicleParamsSchema,
        headers: ifMatchHeaders,
        body: updateVehicleRequestSchema,
        response: { 200: vehicleSchema, ...problemResponses(400, 401, 403, 404, 409, 422, 428) },
      },
    },
    async (request, reply) => {
      const vehicle = await personale.updateVehicle(
        tenantOf(request),
        request.params.residentId,
        request.params.vehicleId,
        requireIfMatch(request),
        request.body,
      );
      void reply.header('etag', formatEtag(vehicle.version));
      return vehicle;
    },
  );

  app.delete(
    `${cars}/:vehicleId`,
    {
      config: { access: 'family', permission: 'residents.write' },
      schema: {
        tags: ['personale'],
        operationId: 'personale.deleteVehicle',
        summary: 'Move a vehicle to the trash',
        params: vehicleParamsSchema,
        headers: ifMatchHeaders,
        response: { 204: z.null(), ...problemResponses(401, 403, 404, 409, 428) },
      },
    },
    async (request, reply) => {
      await personale.deleteVehicle(
        tenantOf(request),
        request.params.residentId,
        request.params.vehicleId,
        requireIfMatch(request),
      );
      return reply.status(204).send(null);
    },
  );

  const banks = `${one}/bank-accounts`;
  app.get(
    banks,
    {
      config: { access: 'family', permission: 'residents.read', planFeature: 'vault_personal' },
      schema: {
        tags: ['personale'],
        operationId: 'personale.listBankAccounts',
        summary: 'Personal bank accounts as metadata, without the full number',
        params: residentParamsSchema,
        querystring: residentScopedListQuerySchema,
        response: { 200: bankAccountPageSchema, ...problemResponses(400, 401, 403, 404) },
      },
    },
    async (request) =>
      personale.listBankAccounts(tenantOf(request), request.params.residentId, {
        limit: request.query.limit,
        after: instantCursor(request.query.cursor),
      }),
  );

  app.post(
    banks,
    {
      config: {
        access: 'family',
        permission: 'residents.write',
        planFeature: 'vault_personal',
        idempotent: true,
      },
      schema: {
        tags: ['personale'],
        operationId: 'personale.createBankAccount',
        summary: 'Add personal bank-account metadata',
        params: residentParamsSchema,
        headers: idempotencyHeaders,
        body: createBankAccountRequestSchema,
        response: { 201: personalBankAccountSchema, ...problemResponses(400, 401, 403, 404, 409, 422) },
      },
    },
    async (request, reply) => {
      const account = await personale.createBankAccount(
        tenantOf(request),
        request.params.residentId,
        request.body,
      );
      void reply.status(201).header('etag', formatEtag(account.version));
      return account;
    },
  );

  app.patch(
    `${banks}/:accountId`,
    {
      config: { access: 'family', permission: 'residents.write', planFeature: 'vault_personal' },
      schema: {
        tags: ['personale'],
        operationId: 'personale.updateBankAccount',
        summary: 'Update personal bank-account metadata',
        params: bankAccountParamsSchema,
        headers: ifMatchHeaders,
        body: updateBankAccountRequestSchema,
        response: { 200: personalBankAccountSchema, ...problemResponses(400, 401, 403, 404, 409, 422, 428) },
      },
    },
    async (request, reply) => {
      const account = await personale.updateBankAccount(
        tenantOf(request),
        request.params.residentId,
        request.params.accountId,
        requireIfMatch(request),
        request.body,
      );
      void reply.header('etag', formatEtag(account.version));
      return account;
    },
  );

  app.delete(
    `${banks}/:accountId`,
    {
      config: { access: 'family', permission: 'residents.write', planFeature: 'vault_personal' },
      schema: {
        tags: ['personale'],
        operationId: 'personale.deleteBankAccount',
        summary: 'Move personal bank-account metadata to the trash',
        params: bankAccountParamsSchema,
        headers: ifMatchHeaders,
        response: { 204: z.null(), ...problemResponses(401, 403, 404, 409, 428) },
      },
    },
    async (request, reply) => {
      await personale.deleteBankAccount(
        tenantOf(request),
        request.params.residentId,
        request.params.accountId,
        requireIfMatch(request),
      );
      return reply.status(204).send(null);
    },
  );

  app.get(
    '/api/v1/families/:familyId/tax-checklist',
    {
      config: { access: 'family', permission: 'taxes.read', planFeature: 'taxes' },
      schema: {
        tags: ['personale'],
        operationId: 'personale.listTaxChecklist',
        summary: 'Annual tax checklist of one person',
        params: familyParamsSchema,
        querystring: taxListQuerySchema,
        response: { 200: taxChecklistSchema, ...problemResponses(400, 401, 403, 404) },
      },
    },
    async (request) => personale.listTax(tenantOf(request), request.query.residentId, request.query.year),
  );

  app.post(
    '/api/v1/families/:familyId/tax-checklist/generate',
    {
      config: { access: 'family', permission: 'taxes.write', planFeature: 'taxes', idempotent: true },
      schema: {
        tags: ['personale'],
        operationId: 'personale.generateTaxChecklist',
        summary: 'Create the standard tax items that are missing for the year',
        params: familyParamsSchema,
        headers: idempotencyHeaders,
        body: generateTaxChecklistRequestSchema,
        response: { 200: taxChecklistSchema, ...problemResponses(400, 401, 403, 404, 409, 422) },
      },
    },
    async (request) => personale.generateTax(tenantOf(request), request.body),
  );

  app.patch(
    '/api/v1/families/:familyId/tax-checklist/:itemId',
    {
      config: { access: 'family', permission: 'taxes.write', planFeature: 'taxes' },
      schema: {
        tags: ['personale'],
        operationId: 'personale.updateTaxItem',
        summary: 'Update the status or the date of a tax item',
        params: taxItemParamsSchema,
        headers: ifMatchHeaders,
        body: updateTaxItemRequestSchema,
        response: { 200: taxChecklistItemSchema, ...problemResponses(400, 401, 403, 404, 409, 422, 428) },
      },
    },
    async (request, reply) => {
      const item = await personale.updateTaxItem(
        tenantOf(request),
        request.params.itemId,
        requireIfMatch(request),
        request.body,
      );
      void reply.header('etag', formatEtag(item.version));
      return item;
    },
  );
};
