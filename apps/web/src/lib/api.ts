import {
  HEADERS,
  PROBLEM_TITLES,
  familyListSchema,
  familySchema,
  formatEtag,
  housePageSchema,
  houseSchema,
  meSchema,
  membershipPageSchema,
  problemDetailsSchema,
  problemType,
  type CreateFamilyRequest,
  type CreateHouseRequest,
  type Family,
  type House,
  type Me,
  type Membership,
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
  };
}
