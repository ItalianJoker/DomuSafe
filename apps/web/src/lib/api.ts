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
  bankAccountPageSchema,
  personalBankAccountSchema,
  petPageSchema,
  petSchema,
  phoneLinePageSchema,
  phoneLineSchema,
  rescueCardSchema,
  rescueSheetSchema,
  publicationListSchema,
  publicationSchema,
  publicHousePageSchema,
  publicRescueSheetSchema,
  residentPageSchema,
  residentSchema,
  subscriptionPageSchema,
  subscriptionSchema,
  successionItemSchema,
  successionListSchema,
  taxChecklistItemSchema,
  taxChecklistSchema,
  vehiclePageSchema,
  vehicleSchema,
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
  type PersonalBankAccount,
  type PersonalSubscription,
  type Pet,
  type PhoneLine,
  type PutRescueRequest,
  type Publication,
  type PublicationKind,
  type PublicHousePage,
  type PublicRescueSheet,
  type RescueCard,
  type RescueSheet,
  type Resident,
  type CreateSuccessionItemRequest,
  type SuccessionItem,
  type SuccessionList,
  type UpdateSuccessionItemRequest,
  type TaxChecklist,
  type TaxChecklistItem,
  type Vehicle,
  type CreatePersonalBankAccountRequest,
  type CreatePersonalSubscriptionRequest,
  type CreatePetRequest,
  type CreatePhoneLineRequest,
  type CreateResidentRequest,
  type CreateVehicleRequest,
  type GenerateTaxChecklistRequest,
  type UpdateResidentRequest,
  type UpdateTaxChecklistItemRequest,
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
  /**
   * People linked to one house.
   *
   * @param familyId - Family id.
   * @param houseId - House id.
   * @returns Every page.
   */
  listResidents(familyId: string, houseId: string): Promise<readonly Resident[]>;
  /**
   * Adds a person to the house.
   *
   * @param familyId - Family id.
   * @param body - Name and houses.
   * @param idempotencyKey - UUID for this attempt.
   * @returns The person.
   */
  createResident(familyId: string, body: CreateResidentRequest, idempotencyKey: string): Promise<Resident>;
  /**
   * Updates the identity of a person.
   *
   * @param familyId - Family id.
   * @param residentId - Person id.
   * @param version - Version the form was loaded with.
   * @param patch - Fields to change.
   * @returns The person.
   */
  updateResident(
    familyId: string,
    residentId: string,
    version: number,
    patch: UpdateResidentRequest,
  ): Promise<Resident>;
  /**
   * Reads the rescue card.
   *
   * @param familyId - Family id.
   * @param residentId - Person id.
   * @returns The card.
   */
  getRescue(familyId: string, residentId: string): Promise<RescueCard>;
  /**
   * Replaces the rescue card.
   *
   * @param familyId - Family id.
   * @param residentId - Person id.
   * @param version - Card version the form was loaded with.
   * @param body - The whole card.
   * @returns The stored card.
   */
  putRescue(
    familyId: string,
    residentId: string,
    version: number,
    body: PutRescueRequest,
  ): Promise<RescueCard>;
  /**
   * Readable rescue sheet of one house.
   *
   * @param familyId - Family id.
   * @param houseId - House id.
   * @returns People, medicines, contacts and animals.
   */
  getRescueSheet(familyId: string, houseId: string): Promise<RescueSheet>;
  /**
   * Printed codes of one house, newest first, including the last reading.
   *
   * @param familyId - Family id.
   * @param houseId - House id.
   * @returns The codes the editor may print or revoke.
   */
  listPublications(familyId: string, houseId: string): Promise<readonly Publication[]>;
  /**
   * Prepares a printed code, or returns the one already active.
   *
   * @param familyId - Family id.
   * @param houseId - House id.
   * @param kind - House page or rescue sheet.
   * @param idempotencyKey - UUID for this attempt.
   * @returns The code, with the token while it is active.
   */
  ensurePublication(
    familyId: string,
    houseId: string,
    kind: PublicationKind,
    idempotencyKey: string,
  ): Promise<Publication>;
  /**
   * Revokes a printed code. Sheets that use it stop opening.
   *
   * @param familyId - Family id.
   * @param houseId - House id.
   * @param publicationId - Code id.
   * @param version - Version the screen loaded.
   * @returns The revoked code. The token is null.
   */
  revokePublication(
    familyId: string,
    houseId: string,
    publicationId: string,
    version: number,
  ): Promise<Publication>;
  /**
   * Public house page. No session is required.
   *
   * @param token - Token from the printed address.
   * @returns Shutoffs, tradespeople and the primary contact.
   */
  getPublicHousePage(token: string): Promise<PublicHousePage>;
  /**
   * Public rescue sheet. No session is required.
   *
   * @param token - Token from the printed address.
   * @returns The rescue sheet of that house.
   */
  getPublicRescueSheet(token: string): Promise<PublicRescueSheet>;
  /**
   * Animals of one house.
   *
   * @param familyId - Family id.
   * @param houseId - House id.
   * @returns Every page.
   */
  listPets(familyId: string, houseId: string): Promise<readonly Pet[]>;
  /**
   * Adds an animal.
   *
   * @param familyId - Family id.
   * @param body - Name, species and clinic.
   * @param idempotencyKey - UUID for this attempt.
   * @returns The animal.
   */
  createPet(familyId: string, body: CreatePetRequest, idempotencyKey: string): Promise<Pet>;
  /**
   * Mobile plans of a person.
   *
   * @param familyId - Family id.
   * @param residentId - Person id.
   * @returns Every page.
   */
  listPhoneLines(familyId: string, residentId: string): Promise<readonly PhoneLine[]>;
  /**
   * Adds a mobile plan.
   *
   * @param familyId - Family id.
   * @param residentId - Person id.
   * @param body - Operator, number and plan.
   * @param idempotencyKey - UUID for this attempt.
   * @returns The plan.
   */
  createPhoneLine(
    familyId: string,
    residentId: string,
    body: CreatePhoneLineRequest,
    idempotencyKey: string,
  ): Promise<PhoneLine>;
  /**
   * Personal subscriptions of a person.
   *
   * @param familyId - Family id.
   * @param residentId - Person id.
   * @returns Every page.
   */
  listSubscriptions(familyId: string, residentId: string): Promise<readonly PersonalSubscription[]>;
  /**
   * Adds a personal subscription.
   *
   * @param familyId - Family id.
   * @param residentId - Person id.
   * @param body - Name and renewal.
   * @param idempotencyKey - UUID for this attempt.
   * @returns The subscription.
   */
  createSubscription(
    familyId: string,
    residentId: string,
    body: CreatePersonalSubscriptionRequest,
    idempotencyKey: string,
  ): Promise<PersonalSubscription>;
  /**
   * Vehicles of a person.
   *
   * @param familyId - Family id.
   * @param residentId - Person id.
   * @returns Every page.
   */
  listVehicles(familyId: string, residentId: string): Promise<readonly Vehicle[]>;
  /**
   * Adds a vehicle.
   *
   * @param familyId - Family id.
   * @param residentId - Person id.
   * @param body - Plate and deadlines.
   * @param idempotencyKey - UUID for this attempt.
   * @returns The vehicle.
   */
  createVehicle(
    familyId: string,
    residentId: string,
    body: CreateVehicleRequest,
    idempotencyKey: string,
  ): Promise<Vehicle>;
  /**
   * Personal bank-account metadata. The route answers 403 without Premium.
   *
   * @param familyId - Family id.
   * @param residentId - Person id.
   * @returns Every page.
   */
  listBankAccounts(familyId: string, residentId: string): Promise<readonly PersonalBankAccount[]>;
  /**
   * Adds bank-account metadata.
   *
   * @param familyId - Family id.
   * @param residentId - Person id.
   * @param body - Institution, label and optional last digits.
   * @param idempotencyKey - UUID for this attempt.
   * @returns The metadata.
   */
  createBankAccount(
    familyId: string,
    residentId: string,
    body: CreatePersonalBankAccountRequest,
    idempotencyKey: string,
  ): Promise<PersonalBankAccount>;
  /**
   * Tax checklist of one year. The route answers 403 without Premium.
   *
   * @param familyId - Family id.
   * @param residentId - Person id.
   * @param year - Calendar year.
   * @returns The items.
   */
  listTax(familyId: string, residentId: string, year: number): Promise<TaxChecklist>;
  /**
   * Creates the missing tax items of a year.
   *
   * @param familyId - Family id.
   * @param body - Person and year.
   * @param idempotencyKey - UUID for this attempt.
   * @returns The checklist.
   */
  generateTax(
    familyId: string,
    body: GenerateTaxChecklistRequest,
    idempotencyKey: string,
  ): Promise<TaxChecklist>;
  /**
   * Updates one tax item.
   *
   * @param familyId - Family id.
   * @param itemId - Item id.
   * @param version - Version the form was loaded with.
   * @param patch - Status or date.
   * @returns The item.
   */
  updateTaxItem(
    familyId: string,
    itemId: string,
    version: number,
    patch: UpdateTaxChecklistItemRequest,
  ): Promise<TaxChecklistItem>;
  /**
   * Family succession checklist. The route answers 403 without Premium.
   *
   * @param familyId - Family id.
   * @returns The activities. Vault documents are not included.
   */
  listSuccession(familyId: string): Promise<SuccessionList>;
  /**
   * Adds the standard succession activities that are missing.
   *
   * @param familyId - Family id.
   * @param idempotencyKey - UUID for this attempt.
   * @returns The checklist.
   */
  prepareSuccession(familyId: string, idempotencyKey: string): Promise<SuccessionList>;
  /**
   * Adds one activity written by the family.
   *
   * @param familyId - Family id.
   * @param body - Title and optional notes. A run of eight digits is rejected.
   * @param idempotencyKey - UUID for this attempt.
   * @returns The activity.
   */
  createSuccessionItem(
    familyId: string,
    body: CreateSuccessionItemRequest,
    idempotencyKey: string,
  ): Promise<SuccessionItem>;
  /**
   * Edits one activity or marks it done.
   *
   * @param familyId - Family id.
   * @param itemId - Activity id.
   * @param version - Version the form was loaded with.
   * @param patch - Title, notes or done mark.
   * @returns The activity.
   */
  updateSuccessionItem(
    familyId: string,
    itemId: string,
    version: number,
    patch: UpdateSuccessionItemRequest,
  ): Promise<SuccessionItem>;
  /**
   * Removes one activity.
   *
   * @param familyId - Family id.
   * @param itemId - Activity id.
   * @param version - Version the form was loaded with.
   */
  deleteSuccessionItem(familyId: string, itemId: string, version: number): Promise<void>;
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
    listResidents(familyId, houseId) {
      return collect((cursor) =>
        client
          .GET('/api/v1/families/{familyId}/residents', {
            params: {
              path: { familyId },
              query: { limit: 200, houseId, ...(cursor === undefined ? {} : { cursor }) },
            },
          })
          .then((result) => unwrap(residentPageSchema, result)),
      );
    },
    async createResident(familyId, body, idempotencyKey) {
      const result = await client.POST('/api/v1/families/{familyId}/residents', {
        params: { path: { familyId } },
        body: body as components['schemas']['CreateResidentRequestInput'],
        headers: { [HEADERS.idempotencyKey]: idempotencyKey },
      });
      return unwrap(residentSchema, result);
    },
    async updateResident(familyId, residentId, version, patch) {
      const result = await client.PATCH('/api/v1/families/{familyId}/residents/{residentId}', {
        params: { path: { familyId, residentId } },
        body: patch as components['schemas']['UpdateResidentRequestInput'],
        headers: { [HEADERS.ifMatch]: formatEtag(version) },
      });
      return unwrap(residentSchema, result);
    },
    async getRescue(familyId, residentId) {
      const result = await client.GET('/api/v1/families/{familyId}/residents/{residentId}/rescue', {
        params: { path: { familyId, residentId } },
      });
      return unwrap(rescueCardSchema, result);
    },
    async putRescue(familyId, residentId, version, body) {
      const result = await client.PUT('/api/v1/families/{familyId}/residents/{residentId}/rescue', {
        params: { path: { familyId, residentId } },
        body,
        headers: { [HEADERS.ifMatch]: formatEtag(version) },
      });
      return unwrap(rescueCardSchema, result);
    },
    async getRescueSheet(familyId, houseId) {
      const result = await client.GET('/api/v1/families/{familyId}/houses/{houseId}/rescue-sheet', {
        params: { path: { familyId, houseId } },
      });
      return unwrap(rescueSheetSchema, result);
    },
    async listPublications(familyId, houseId) {
      const result = await client.GET('/api/v1/families/{familyId}/houses/{houseId}/publications', {
        params: { path: { familyId, houseId } },
      });
      return (await unwrap(publicationListSchema, result)).items;
    },
    async ensurePublication(familyId, houseId, kind, idempotencyKey) {
      const result = await client.POST('/api/v1/families/{familyId}/houses/{houseId}/publications', {
        params: { path: { familyId, houseId } },
        body: { kind },
        headers: { [HEADERS.idempotencyKey]: idempotencyKey },
      });
      return unwrap(publicationSchema, result);
    },
    async revokePublication(familyId, houseId, publicationId, version) {
      const result = await client.POST(
        '/api/v1/families/{familyId}/houses/{houseId}/publications/{publicationId}/revoke',
        {
          params: { path: { familyId, houseId, publicationId } },
          headers: { [HEADERS.ifMatch]: formatEtag(version) },
        },
      );
      return unwrap(publicationSchema, result);
    },
    async getPublicHousePage(token) {
      const result = await client.GET('/api/v1/public/house-pages/{token}', {
        params: { path: { token } },
      });
      return unwrap(publicHousePageSchema, result);
    },
    async getPublicRescueSheet(token) {
      const result = await client.GET('/api/v1/public/rescue-sheets/{token}', {
        params: { path: { token } },
      });
      return unwrap(publicRescueSheetSchema, result);
    },
    listPets(familyId, houseId) {
      return collect((cursor) =>
        client
          .GET('/api/v1/families/{familyId}/pets', {
            params: {
              path: { familyId },
              query: { limit: 200, houseId, ...(cursor === undefined ? {} : { cursor }) },
            },
          })
          .then((result) => unwrap(petPageSchema, result)),
      );
    },
    async createPet(familyId, body, idempotencyKey) {
      const result = await client.POST('/api/v1/families/{familyId}/pets', {
        params: { path: { familyId } },
        body: body as components['schemas']['CreatePetRequestInput'],
        headers: { [HEADERS.idempotencyKey]: idempotencyKey },
      });
      return unwrap(petSchema, result);
    },
    listPhoneLines(familyId, residentId) {
      return collect((cursor) =>
        client
          .GET('/api/v1/families/{familyId}/residents/{residentId}/phone-lines', {
            params: {
              path: { familyId, residentId },
              query: { limit: 200, ...(cursor === undefined ? {} : { cursor }) },
            },
          })
          .then((result) => unwrap(phoneLinePageSchema, result)),
      );
    },
    async createPhoneLine(familyId, residentId, body, idempotencyKey) {
      const result = await client.POST('/api/v1/families/{familyId}/residents/{residentId}/phone-lines', {
        params: { path: { familyId, residentId } },
        body: body as components['schemas']['CreatePhoneLineRequestInput'],
        headers: { [HEADERS.idempotencyKey]: idempotencyKey },
      });
      return unwrap(phoneLineSchema, result);
    },
    listSubscriptions(familyId, residentId) {
      return collect((cursor) =>
        client
          .GET('/api/v1/families/{familyId}/residents/{residentId}/subscriptions', {
            params: {
              path: { familyId, residentId },
              query: { limit: 200, ...(cursor === undefined ? {} : { cursor }) },
            },
          })
          .then((result) => unwrap(subscriptionPageSchema, result)),
      );
    },
    async createSubscription(familyId, residentId, body, idempotencyKey) {
      const result = await client.POST('/api/v1/families/{familyId}/residents/{residentId}/subscriptions', {
        params: { path: { familyId, residentId } },
        body: body as components['schemas']['CreatePersonalSubscriptionRequestInput'],
        headers: { [HEADERS.idempotencyKey]: idempotencyKey },
      });
      return unwrap(subscriptionSchema, result);
    },
    listVehicles(familyId, residentId) {
      return collect((cursor) =>
        client
          .GET('/api/v1/families/{familyId}/residents/{residentId}/vehicles', {
            params: {
              path: { familyId, residentId },
              query: { limit: 200, ...(cursor === undefined ? {} : { cursor }) },
            },
          })
          .then((result) => unwrap(vehiclePageSchema, result)),
      );
    },
    async createVehicle(familyId, residentId, body, idempotencyKey) {
      const result = await client.POST('/api/v1/families/{familyId}/residents/{residentId}/vehicles', {
        params: { path: { familyId, residentId } },
        body: body as components['schemas']['CreateVehicleRequestInput'],
        headers: { [HEADERS.idempotencyKey]: idempotencyKey },
      });
      return unwrap(vehicleSchema, result);
    },
    listBankAccounts(familyId, residentId) {
      return collect((cursor) =>
        client
          .GET('/api/v1/families/{familyId}/residents/{residentId}/bank-accounts', {
            params: {
              path: { familyId, residentId },
              query: { limit: 200, ...(cursor === undefined ? {} : { cursor }) },
            },
          })
          .then((result) => unwrap(bankAccountPageSchema, result)),
      );
    },
    async createBankAccount(familyId, residentId, body, idempotencyKey) {
      const result = await client.POST('/api/v1/families/{familyId}/residents/{residentId}/bank-accounts', {
        params: { path: { familyId, residentId } },
        body: body as components['schemas']['CreatePersonalBankAccountRequestInput'],
        headers: { [HEADERS.idempotencyKey]: idempotencyKey },
      });
      return unwrap(personalBankAccountSchema, result);
    },
    async listTax(familyId, residentId, year) {
      const result = await client.GET('/api/v1/families/{familyId}/tax-checklist', {
        params: { path: { familyId }, query: { residentId, year } },
      });
      return unwrap(taxChecklistSchema, result);
    },
    async generateTax(familyId, body, idempotencyKey) {
      const result = await client.POST('/api/v1/families/{familyId}/tax-checklist/generate', {
        params: { path: { familyId } },
        body,
        headers: { [HEADERS.idempotencyKey]: idempotencyKey },
      });
      return unwrap(taxChecklistSchema, result);
    },
    async updateTaxItem(familyId, itemId, version, patch) {
      const result = await client.PATCH('/api/v1/families/{familyId}/tax-checklist/{itemId}', {
        params: { path: { familyId, itemId } },
        body: patch as components['schemas']['UpdateTaxChecklistItemRequestInput'],
        headers: { [HEADERS.ifMatch]: formatEtag(version) },
      });
      return unwrap(taxChecklistItemSchema, result);
    },
    async listSuccession(familyId) {
      const result = await client.GET('/api/v1/families/{familyId}/succession', {
        params: { path: { familyId } },
      });
      return unwrap(successionListSchema, result);
    },
    async prepareSuccession(familyId, idempotencyKey) {
      const result = await client.POST('/api/v1/families/{familyId}/succession/prepare', {
        params: { path: { familyId } },
        headers: { [HEADERS.idempotencyKey]: idempotencyKey },
      });
      return unwrap(successionListSchema, result);
    },
    async createSuccessionItem(familyId, body, idempotencyKey) {
      const result = await client.POST('/api/v1/families/{familyId}/succession', {
        params: { path: { familyId } },
        body: body as components['schemas']['CreateSuccessionItemRequestInput'],
        headers: { [HEADERS.idempotencyKey]: idempotencyKey },
      });
      return unwrap(successionItemSchema, result);
    },
    async updateSuccessionItem(familyId, itemId, version, patch) {
      const result = await client.PATCH('/api/v1/families/{familyId}/succession/{itemId}', {
        params: { path: { familyId, itemId } },
        body: patch as components['schemas']['UpdateSuccessionItemRequestInput'],
        headers: { [HEADERS.ifMatch]: formatEtag(version) },
      });
      return unwrap(successionItemSchema, result);
    },
    async deleteSuccessionItem(familyId, itemId, version) {
      const result = await client.DELETE('/api/v1/families/{familyId}/succession/{itemId}', {
        params: { path: { familyId, itemId } },
        headers: { [HEADERS.ifMatch]: formatEtag(version) },
      });
      ensureOk(result);
    },
  };
}
