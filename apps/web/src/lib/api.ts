import {
  HEADERS,
  PROBLEM_TITLES,
  familyListSchema,
  familySchema,
  formatEtag,
  contactPageSchema,
  contactSchema,
  guideEntryPageSchema,
  guideEntrySchema,
  guestViewSchema,
  housePageSchema,
  houseSchema,
  maintenanceTaskPageSchema,
  maintenanceTaskSchema,
  meSchema,
  membershipPageSchema,
  shutoffPageSchema,
  shutoffSchema,
  utilityPageSchema,
  utilitySchema,
  wasteCollectionPageSchema,
  wasteCollectionSchema,
  problemDetailsSchema,
  problemType,
  type Contact,
  type CreateContactRequest,
  type CreateFamilyRequest,
  type CreateGuideEntryRequest,
  type CreateHouseRequest,
  type CreateMaintenanceTaskRequest,
  type CreateShutoffRequest,
  type CreateUtilityRequest,
  type CreateWasteCollectionRequest,
  type Family,
  type GuideEntry,
  type GuestView,
  type House,
  type MaintenanceTask,
  type Me,
  type Membership,
  type Shutoff,
  type UpdateContactRequest,
  type UpdateGuideEntryRequest,
  type UpdateMaintenanceTaskRequest,
  type UpdateShutoffRequest,
  type UpdateUtilityRequest,
  type UpdateWasteCollectionRequest,
  type Utility,
  type WasteCollection,
  type ProblemDetails,
  type UpdateFamilyRequest,
  type UpdateHouseRequest,
  type UpdateProfileRequest,
} from '@domusafe/contracts';
import createClient, { type Middleware } from 'openapi-fetch';
import { z } from 'zod';
import type { components, paths } from './api.generated.js';

const createdFamilySchema = z.object({ family: familySchema, house: houseSchema }).strict();

/**
 * Failure returned by the API as RFC 9457 problem details.
 *
 * Preconditions: `problem` was parsed from a response body or synthesized for a non-problem failure.
 * Postconditions: `message` is the localized title.
 */
export class ApiProblem extends Error {
  /** Parsed problem details from the response. */
  readonly problem: ProblemDetails;

  /**
   * Wraps problem details as an Error so screens can catch one type.
   *
   * @param problem - Problem details from the response, or a synthesized failure.
   */
  constructor(problem: ProblemDetails) {
    super(problem.title);
    this.name = 'ApiProblem';
    this.problem = problem;
  }
}

/** Browser-facing calls used by the shell. Later modules add methods here rather than calling `fetch` ad hoc. */
export interface DomusafeApi {
  /**
   * Current account, or null when the session is missing.
   *
   * @returns The profile, or null on 401.
   */
  getMe(): Promise<Me | null>;
  /**
   * Updates name, language, theme or the last opened family and house.
   *
   * @param patch - Fields to change.
   * @returns The updated profile.
   */
  updateProfile(patch: UpdateProfileRequest): Promise<Me>;
  /**
   * Families of the current account.
   *
   * @returns Every family the account belongs to.
   */
  listFamilies(): Promise<readonly Family[]>;
  /**
   * One family visible to the account.
   *
   * @param familyId - Family id.
   * @returns The family, including role and plan.
   */
  getFamily(familyId: string): Promise<Family>;
  /**
   * Creates a family and its first house.
   *
   * @param body - Manual fields.
   * @param idempotencyKey - UUID for this attempt.
   * @returns The new family and house.
   */
  createFamily(body: CreateFamilyRequest, idempotencyKey: string): Promise<{ family: Family; house: House }>;
  /**
   * Updates the family name, time zone, currency or language.
   *
   * @param familyId - Family id.
   * @param version - Version the form was loaded with.
   * @param patch - Manual fields.
   * @returns The updated family.
   */
  updateFamily(familyId: string, version: number, patch: UpdateFamilyRequest): Promise<Family>;
  /**
   * Houses visible in a family.
   *
   * @param familyId - Family id.
   * @returns Every page, in order.
   */
  listHouses(familyId: string): Promise<readonly House[]>;
  /**
   * Adds a house.
   *
   * @param familyId - Family id.
   * @param body - Manual fields.
   * @param idempotencyKey - UUID for this attempt.
   * @returns The new house.
   */
  createHouse(familyId: string, body: CreateHouseRequest, idempotencyKey: string): Promise<House>;
  /**
   * Updates a house.
   *
   * @param familyId - Family id.
   * @param houseId - House id.
   * @param version - Version the form was loaded with.
   * @param patch - Manual fields.
   * @returns The updated house.
   */
  updateHouse(familyId: string, houseId: string, version: number, patch: UpdateHouseRequest): Promise<House>;
  /**
   * People of a family.
   *
   * @param familyId - Family id.
   * @returns Every page, in order.
   */
  listMembers(familyId: string): Promise<readonly Membership[]>;
  /**
   * Guest projection of one house: manual entries for guests and waste rules.
   *
   * @param familyId - Family id.
   * @param houseId - House id.
   * @returns What a guest of the house can read.
   */
  getGuestView(familyId: string, houseId: string): Promise<GuestView>;
  /**
   * Same projection as {@link DomusafeApi.getGuestView}, for the people who edit the house.
   *
   * @param familyId - Family id.
   * @param houseId - House id.
   * @returns The guest projection.
   */
  previewGuestView(familyId: string, houseId: string): Promise<GuestView>;
  /**
   * Manual entries of one house.
   *
   * @param familyId - Family id.
   * @param houseId - House id.
   * @param audience - Optional audience filter.
   * @returns Every page.
   */
  listGuideEntries(
    familyId: string,
    houseId: string,
    audience?: GuideEntry['audience'],
  ): Promise<readonly GuideEntry[]>;
  /**
   * Adds a manual entry. The id is a UUIDv7 from this browser.
   *
   * @param familyId - Family id.
   * @param houseId - House id.
   * @param body - Manual fields. Secrets belong in `sealed`, never in the text.
   * @param idempotencyKey - UUID for this attempt.
   * @returns The entry.
   */
  createGuideEntry(
    familyId: string,
    houseId: string,
    body: CreateGuideEntryRequest,
    idempotencyKey: string,
  ): Promise<GuideEntry>;
  /**
   * Updates a manual entry.
   *
   * @param familyId - Family id.
   * @param houseId - House id.
   * @param entryId - Entry id.
   * @param version - Version the form was loaded with.
   * @param patch - Manual fields.
   * @returns The entry.
   */
  updateGuideEntry(
    familyId: string,
    houseId: string,
    entryId: string,
    version: number,
    patch: UpdateGuideEntryRequest,
  ): Promise<GuideEntry>;
  /**
   * Cutoff locations of one house.
   *
   * @param familyId - Family id.
   * @param houseId - House id.
   * @returns Every page.
   */
  listShutoffs(familyId: string, houseId: string): Promise<readonly Shutoff[]>;
  /**
   * Adds a cutoff location.
   *
   * @param familyId - Family id.
   * @param houseId - House id.
   * @param body - Manual fields.
   * @param idempotencyKey - UUID for this attempt.
   * @returns The cutoff.
   */
  createShutoff(
    familyId: string,
    houseId: string,
    body: CreateShutoffRequest,
    idempotencyKey: string,
  ): Promise<Shutoff>;
  /**
   * Updates a cutoff location.
   *
   * @param familyId - Family id.
   * @param houseId - House id.
   * @param shutoffId - Cutoff id.
   * @param version - Version the form was loaded with.
   * @param patch - Manual fields.
   * @returns The cutoff.
   */
  updateShutoff(
    familyId: string,
    houseId: string,
    shutoffId: string,
    version: number,
    patch: UpdateShutoffRequest,
  ): Promise<Shutoff>;
  /**
   * Waste rules of one house.
   *
   * @param familyId - Family id.
   * @param houseId - House id.
   * @returns Every page.
   */
  listWaste(familyId: string, houseId: string): Promise<readonly WasteCollection[]>;
  /**
   * Adds a waste rule.
   *
   * @param familyId - Family id.
   * @param houseId - House id.
   * @param body - Manual fields.
   * @param idempotencyKey - UUID for this attempt.
   * @returns The rule.
   */
  createWaste(
    familyId: string,
    houseId: string,
    body: CreateWasteCollectionRequest,
    idempotencyKey: string,
  ): Promise<WasteCollection>;
  /**
   * Updates a waste rule.
   *
   * @param familyId - Family id.
   * @param houseId - House id.
   * @param collectionId - Rule id.
   * @param version - Version the form was loaded with.
   * @param patch - Manual fields.
   * @returns The rule.
   */
  updateWaste(
    familyId: string,
    houseId: string,
    collectionId: string,
    version: number,
    patch: UpdateWasteCollectionRequest,
  ): Promise<WasteCollection>;
  /**
   * Deletes a waste rule.
   *
   * @param familyId - Family id.
   * @param houseId - House id.
   * @param collectionId - Rule id.
   * @param version - Version the form was loaded with.
   */
  deleteWaste(familyId: string, houseId: string, collectionId: string, version: number): Promise<void>;
  /**
   * Contacts of a family. Artisans use kind `craftsman`.
   *
   * @param familyId - Family id.
   * @param filter - Optional kind and house.
   * @returns Every page.
   */
  listContacts(
    familyId: string,
    filter?: { readonly kind?: Contact['kind']; readonly houseId?: string },
  ): Promise<readonly Contact[]>;
  /**
   * Adds a contact.
   *
   * @param familyId - Family id.
   * @param body - Manual fields.
   * @param idempotencyKey - UUID for this attempt.
   * @returns The contact.
   */
  createContact(familyId: string, body: CreateContactRequest, idempotencyKey: string): Promise<Contact>;
  /**
   * Updates a contact.
   *
   * @param familyId - Family id.
   * @param contactId - Contact id.
   * @param version - Version the form was loaded with.
   * @param patch - Manual fields.
   * @returns The contact.
   */
  updateContact(
    familyId: string,
    contactId: string,
    version: number,
    patch: UpdateContactRequest,
  ): Promise<Contact>;
  /**
   * Utility contracts of one house.
   *
   * @param familyId - Family id.
   * @param houseId - House id.
   * @returns Every page.
   */
  listUtilities(familyId: string, houseId: string): Promise<readonly Utility[]>;
  /**
   * Adds a utility contract.
   *
   * @param familyId - Family id.
   * @param houseId - House id.
   * @param body - Manual fields. Payment secrets belong in `sealed`.
   * @param idempotencyKey - UUID for this attempt.
   * @returns The contract.
   */
  createUtility(
    familyId: string,
    houseId: string,
    body: CreateUtilityRequest,
    idempotencyKey: string,
  ): Promise<Utility>;
  /**
   * Updates a utility contract.
   *
   * @param familyId - Family id.
   * @param houseId - House id.
   * @param utilityId - Contract id.
   * @param version - Version the form was loaded with.
   * @param patch - Manual fields.
   * @returns The contract.
   */
  updateUtility(
    familyId: string,
    houseId: string,
    utilityId: string,
    version: number,
    patch: UpdateUtilityRequest,
  ): Promise<Utility>;
  /**
   * Maintenance tasks of one house, including the boiler check.
   *
   * @param familyId - Family id.
   * @param houseId - House id.
   * @param category - Optional category filter.
   * @returns Every page.
   */
  listMaintenance(
    familyId: string,
    houseId: string,
    category?: MaintenanceTask['category'],
  ): Promise<readonly MaintenanceTask[]>;
  /**
   * Adds a maintenance task.
   *
   * @param familyId - Family id.
   * @param houseId - House id.
   * @param body - Manual fields.
   * @param idempotencyKey - UUID for this attempt.
   * @returns The task.
   */
  createMaintenance(
    familyId: string,
    houseId: string,
    body: CreateMaintenanceTaskRequest,
    idempotencyKey: string,
  ): Promise<MaintenanceTask>;
  /**
   * Updates a maintenance task.
   *
   * @param familyId - Family id.
   * @param houseId - House id.
   * @param taskId - Task id.
   * @param version - Version the form was loaded with.
   * @param patch - Manual fields.
   * @returns The task.
   */
  updateMaintenance(
    familyId: string,
    houseId: string,
    taskId: string,
    version: number,
    patch: UpdateMaintenanceTaskRequest,
  ): Promise<MaintenanceTask>;
}

/** Options of {@link createApi}. */
export interface ApiOptions {
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

function ensureOk(result: CallResult): void {
  if (!result.response.ok) {
    throw toProblem(result.error, result.response);
  }
}

function parseBody<T>(schema: z.ZodType<T>, data: unknown, response: Response): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new Error(`Unexpected response from ${response.url}: ${parsed.error.message}`);
  }
  return parsed.data;
}

async function unwrap<T>(schema: z.ZodType<T>, result: CallResult): Promise<T> {
  if (result.response.ok) {
    return parseBody(schema, result.data, result.response);
  }
  throw toProblem(result.error, result.response);
}

/**
 * Builds the typed client for `/api/v1`.
 *
 * Preconditions: mutating calls run on an origin the API trusts.
 * Postconditions: mutations send `X-DomuSafe-Request: 1` and creations send an idempotency key.
 * Data contract: responses are parsed with the shared Zod schemas; a 401 on `getMe` is null.
 *
 * @param options - Base URL, fetch and language.
 * @returns The shell API.
 */
export function createApi(options: ApiOptions = {}): DomusafeApi {
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
    async getMe() {
      const result = await client.GET('/api/v1/me');
      if (result.response.status === 401) {
        return null;
      }
      return unwrap(meSchema, result);
    },
    async updateProfile(patch) {
      const result = await client.PATCH('/api/v1/me/profile', {
        body: patch as components['schemas']['UpdateProfileRequestInput'],
      });
      return unwrap(meSchema, result);
    },
    async listFamilies() {
      const result = await client.GET('/api/v1/families');
      return (await unwrap(familyListSchema, result)).items;
    },
    async getFamily(familyId) {
      const result = await client.GET('/api/v1/families/{familyId}', { params: { path: { familyId } } });
      return unwrap(familySchema, result);
    },
    async createFamily(body, idempotencyKey) {
      const result = await client.POST('/api/v1/families', {
        body,
        headers: { [HEADERS.idempotencyKey]: idempotencyKey },
      });
      return unwrap(createdFamilySchema, result);
    },
    async updateFamily(familyId, version, patch) {
      const result = await client.PATCH('/api/v1/families/{familyId}', {
        params: { path: { familyId } },
        body: patch as components['schemas']['UpdateFamilyRequestInput'],
        headers: { [HEADERS.ifMatch]: formatEtag(version) },
      });
      return unwrap(familySchema, result);
    },
    async listHouses(familyId) {
      const items: House[] = [];
      let cursor: string | undefined;
      do {
        const result = await client.GET('/api/v1/families/{familyId}/houses', {
          params: {
            path: { familyId },
            query: { limit: 200, ...(cursor === undefined ? {} : { cursor }) },
          },
        });
        const page = await unwrap(housePageSchema, result);
        items.push(...page.items);
        cursor = page.nextCursor ?? undefined;
      } while (cursor !== undefined);
      return items;
    },
    async createHouse(familyId, body, idempotencyKey) {
      const result = await client.POST('/api/v1/families/{familyId}/houses', {
        params: { path: { familyId } },
        body: body as components['schemas']['CreateHouseRequestInput'],
        headers: { [HEADERS.idempotencyKey]: idempotencyKey },
      });
      return unwrap(houseSchema, result);
    },
    async updateHouse(familyId, houseId, version, patch) {
      const result = await client.PATCH('/api/v1/families/{familyId}/houses/{houseId}', {
        params: { path: { familyId, houseId } },
        body: patch as components['schemas']['UpdateHouseRequestInput'],
        headers: { [HEADERS.ifMatch]: formatEtag(version) },
      });
      return unwrap(houseSchema, result);
    },
    async listMembers(familyId) {
      const items: Membership[] = [];
      let cursor: string | undefined;
      do {
        const result = await client.GET('/api/v1/families/{familyId}/members', {
          params: {
            path: { familyId },
            query: { limit: 200, ...(cursor === undefined ? {} : { cursor }) },
          },
        });
        const page = await unwrap(membershipPageSchema, result);
        items.push(...page.items);
        cursor = page.nextCursor ?? undefined;
      } while (cursor !== undefined);
      return items;
    },
    getGuestView(familyId, houseId) {
      return client
        .GET('/api/v1/families/{familyId}/houses/{houseId}/guest-view', {
          params: { path: { familyId, houseId } },
        })
        .then((result) => unwrap(guestViewSchema, result));
    },
    previewGuestView(familyId, houseId) {
      return client
        .GET('/api/v1/families/{familyId}/houses/{houseId}/guest-view/preview', {
          params: { path: { familyId, houseId } },
        })
        .then((result) => unwrap(guestViewSchema, result));
    },
    listGuideEntries(familyId, houseId, audience) {
      return collect((cursor) =>
        client
          .GET('/api/v1/families/{familyId}/houses/{houseId}/guide-entries', {
            params: {
              path: { familyId, houseId },
              query: {
                limit: 200,
                ...(cursor === undefined ? {} : { cursor }),
                ...(audience === undefined ? {} : { audience }),
              },
            },
          })
          .then((result) => unwrap(guideEntryPageSchema, result)),
      );
    },
    async createGuideEntry(familyId, houseId, body, idempotencyKey) {
      const result = await client.POST('/api/v1/families/{familyId}/houses/{houseId}/guide-entries', {
        params: { path: { familyId, houseId } },
        body: body as components['schemas']['CreateGuideEntryRequestInput'],
        headers: { [HEADERS.idempotencyKey]: idempotencyKey },
      });
      return unwrap(guideEntrySchema, result);
    },
    async updateGuideEntry(familyId, houseId, entryId, version, patch) {
      const result = await client.PATCH(
        '/api/v1/families/{familyId}/houses/{houseId}/guide-entries/{entryId}',
        {
          params: { path: { familyId, houseId, entryId } },
          body: patch as components['schemas']['UpdateGuideEntryRequestInput'],
          headers: { [HEADERS.ifMatch]: formatEtag(version) },
        },
      );
      return unwrap(guideEntrySchema, result);
    },
    listShutoffs(familyId, houseId) {
      return collect((cursor) =>
        client
          .GET('/api/v1/families/{familyId}/houses/{houseId}/shutoffs', {
            params: {
              path: { familyId, houseId },
              query: { limit: 200, ...(cursor === undefined ? {} : { cursor }) },
            },
          })
          .then((result) => unwrap(shutoffPageSchema, result)),
      );
    },
    async createShutoff(familyId, houseId, body, idempotencyKey) {
      const result = await client.POST('/api/v1/families/{familyId}/houses/{houseId}/shutoffs', {
        params: { path: { familyId, houseId } },
        body,
        headers: { [HEADERS.idempotencyKey]: idempotencyKey },
      });
      return unwrap(shutoffSchema, result);
    },
    async updateShutoff(familyId, houseId, shutoffId, version, patch) {
      const result = await client.PATCH('/api/v1/families/{familyId}/houses/{houseId}/shutoffs/{shutoffId}', {
        params: { path: { familyId, houseId, shutoffId } },
        body: patch as components['schemas']['UpdateShutoffRequestInput'],
        headers: { [HEADERS.ifMatch]: formatEtag(version) },
      });
      return unwrap(shutoffSchema, result);
    },
    listWaste(familyId, houseId) {
      return collect((cursor) =>
        client
          .GET('/api/v1/families/{familyId}/houses/{houseId}/waste-collections', {
            params: {
              path: { familyId, houseId },
              query: { limit: 200, ...(cursor === undefined ? {} : { cursor }) },
            },
          })
          .then((result) => unwrap(wasteCollectionPageSchema, result)),
      );
    },
    async createWaste(familyId, houseId, body, idempotencyKey) {
      const result = await client.POST('/api/v1/families/{familyId}/houses/{houseId}/waste-collections', {
        params: { path: { familyId, houseId } },
        body: body as components['schemas']['CreateWasteCollectionRequestInput'],
        headers: { [HEADERS.idempotencyKey]: idempotencyKey },
      });
      return unwrap(wasteCollectionSchema, result);
    },
    async updateWaste(familyId, houseId, collectionId, version, patch) {
      const result = await client.PATCH(
        '/api/v1/families/{familyId}/houses/{houseId}/waste-collections/{collectionId}',
        {
          params: { path: { familyId, houseId, collectionId } },
          body: patch as components['schemas']['UpdateWasteCollectionRequestInput'],
          headers: { [HEADERS.ifMatch]: formatEtag(version) },
        },
      );
      return unwrap(wasteCollectionSchema, result);
    },
    async deleteWaste(familyId, houseId, collectionId, version) {
      const result = await client.DELETE(
        '/api/v1/families/{familyId}/houses/{houseId}/waste-collections/{collectionId}',
        {
          params: { path: { familyId, houseId, collectionId } },
          headers: { [HEADERS.ifMatch]: formatEtag(version) },
        },
      );
      ensureOk(result);
    },
    listContacts(familyId, filter) {
      return collect((cursor) =>
        client
          .GET('/api/v1/families/{familyId}/contacts', {
            params: {
              path: { familyId },
              query: {
                limit: 200,
                ...(cursor === undefined ? {} : { cursor }),
                ...(filter?.kind === undefined ? {} : { kind: filter.kind }),
                ...(filter?.houseId === undefined ? {} : { houseId: filter.houseId }),
              },
            },
          })
          .then((result) => unwrap(contactPageSchema, result)),
      );
    },
    async createContact(familyId, body, idempotencyKey) {
      const result = await client.POST('/api/v1/families/{familyId}/contacts', {
        params: { path: { familyId } },
        body: body as components['schemas']['CreateContactRequestInput'],
        headers: { [HEADERS.idempotencyKey]: idempotencyKey },
      });
      return unwrap(contactSchema, result);
    },
    async updateContact(familyId, contactId, version, patch) {
      const result = await client.PATCH('/api/v1/families/{familyId}/contacts/{contactId}', {
        params: { path: { familyId, contactId } },
        body: patch as components['schemas']['UpdateContactRequestInput'],
        headers: { [HEADERS.ifMatch]: formatEtag(version) },
      });
      return unwrap(contactSchema, result);
    },
    listUtilities(familyId, houseId) {
      return collect((cursor) =>
        client
          .GET('/api/v1/families/{familyId}/houses/{houseId}/utilities', {
            params: {
              path: { familyId, houseId },
              query: { limit: 200, ...(cursor === undefined ? {} : { cursor }) },
            },
          })
          .then((result) => unwrap(utilityPageSchema, result)),
      );
    },
    async createUtility(familyId, houseId, body, idempotencyKey) {
      const result = await client.POST('/api/v1/families/{familyId}/houses/{houseId}/utilities', {
        params: { path: { familyId, houseId } },
        body: body as components['schemas']['CreateUtilityRequestInput'],
        headers: { [HEADERS.idempotencyKey]: idempotencyKey },
      });
      return unwrap(utilitySchema, result);
    },
    async updateUtility(familyId, houseId, utilityId, version, patch) {
      const result = await client.PATCH(
        '/api/v1/families/{familyId}/houses/{houseId}/utilities/{utilityId}',
        {
          params: { path: { familyId, houseId, utilityId } },
          body: patch as components['schemas']['UpdateUtilityRequestInput'],
          headers: { [HEADERS.ifMatch]: formatEtag(version) },
        },
      );
      return unwrap(utilitySchema, result);
    },
    listMaintenance(familyId, houseId, category) {
      return collect((cursor) =>
        client
          .GET('/api/v1/families/{familyId}/houses/{houseId}/maintenance-tasks', {
            params: {
              path: { familyId, houseId },
              query: {
                limit: 200,
                ...(cursor === undefined ? {} : { cursor }),
                ...(category === undefined ? {} : { category }),
              },
            },
          })
          .then((result) => unwrap(maintenanceTaskPageSchema, result)),
      );
    },
    async createMaintenance(familyId, houseId, body, idempotencyKey) {
      const result = await client.POST('/api/v1/families/{familyId}/houses/{houseId}/maintenance-tasks', {
        params: { path: { familyId, houseId } },
        body: body as components['schemas']['CreateMaintenanceTaskRequestInput'],
        headers: { [HEADERS.idempotencyKey]: idempotencyKey },
      });
      return unwrap(maintenanceTaskSchema, result);
    },
    async updateMaintenance(familyId, houseId, taskId, version, patch) {
      const result = await client.PATCH(
        '/api/v1/families/{familyId}/houses/{houseId}/maintenance-tasks/{taskId}',
        {
          params: { path: { familyId, houseId, taskId } },
          body: patch as components['schemas']['UpdateMaintenanceTaskRequestInput'],
          headers: { [HEADERS.ifMatch]: formatEtag(version) },
        },
      );
      return unwrap(maintenanceTaskSchema, result);
    },
  };
}
