import {
  HEADERS,
  PROBLEM_TITLES,
  familyBrandingResponseSchema,
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
  inventoryItemPageSchema,
  inventoryItemSchema,
  inventorySearchResponseSchema,
  roomPageSchema,
  roomSchema,
  storageUnitPageSchema,
  storageUnitSchema,
  bankAccountPageSchema,
  personalBankAccountSchema,
  petPageSchema,
  petSchema,
  phoneLinePageSchema,
  phoneLineSchema,
  rescueCardSchema,
  rescueSheetSchema,
  publicationListSchema,
  publicationReadingListSchema,
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
  deadlineBoardSchema,
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
  type DeadlineBoard,
  type Contact,
  type CreateContactRequest,
  type CreateFamilyRequest,
  type CreateGuideEntryRequest,
  type CreateHouseRequest,
  type CreateInventoryItemRequest,
  type CreateMaintenanceTaskRequest,
  type CreateRoomRequest,
  type CreateStorageUnitRequest,
  type CreateShutoffRequest,
  type CreateUtilityRequest,
  type CreateWasteCollectionRequest,
  type Family,
  type FamilyBranding,
  type GuideEntry,
  type GuestView,
  type House,
  type InventoryItem,
  type InventorySearchResponse,
  type MaintenanceTask,
  type Room,
  type StorageUnit,
  type Me,
  type PersonalBankAccount,
  type PersonalSubscription,
  type Pet,
  type PhoneLine,
  type PutFamilyBrandingRequest,
  type PutRescueRequest,
  type DeviceLabel,
  type Publication,
  type PublicationKind,
  type PublicationReading,
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
  type BarcodeProduct,
  type CheckShoppingItemRequest,
  type Chore,
  type ChoreCompletion,
  type CreateChoreCompletionRequest,
  type CreateChoreRequest,
  type CreateHandoverRequest,
  type CreateMealPlanEntryRequest,
  type CreatePantryItemRequest,
  type CreateRecipeImportRequest,
  type CreateRecipeRequest,
  type CreateRedemptionRequest,
  type CreateRewardRequest,
  type CreateShoppingItemRequest,
  type CreateShoppingListRequest,
  type CreateStoreRequest,
  type CreatePersonalBankAccountRequest,
  type CreatePersonalSubscriptionRequest,
  type CreatePetRequest,
  type CreatePhoneLineRequest,
  type CreateResidentRequest,
  type CreateVehicleRequest,
  type CreateVitalEntryRequest,
  type GenerateTaxChecklistRequest,
  type Handover,
  type MealPlanEntry,
  type PantryItem,
  type PointsView,
  type PutResidentAboutRequest,
  type Recipe,
  type RecipeImport,
  type Reward,
  type RewardRedemption,
  type ResidentAboutCard,
  type ShoppingItem,
  type ShoppingList,
  type Store,
  type UpdateMealPlanEntryRequest,
  type UpdatePantryItemRequest,
  type UpdateRecipeRequest,
  type UpdateShoppingItemRequest,
  type UpdateShoppingListRequest,
  type UpdateStoreRequest,
  type UpsertBarcodeProductRequest,
  type UpdateResidentRequest,
  type UpdateTaxChecklistItemRequest,
  type Membership,
  type Shutoff,
  type UpdateContactRequest,
  type UpdateGuideEntryRequest,
  type UpdateInventoryItemRequest,
  type UpdateMaintenanceTaskRequest,
  type UpdateRoomRequest,
  type UpdateStorageUnitRequest,
  type UpdateShutoffRequest,
  type UpdateUtilityRequest,
  type UpdateWasteCollectionRequest,
  type Utility,
  type VitalEntry,
  type WasteCollection,
  type ProblemDetails,
  type UpdateFamilyRequest,
  type UpdateHouseRequest,
  type UpdateProfileRequest,
  choreCompletionPageSchema,
  choreCompletionSchema,
  chorePageSchema,
  choreSchema,
  finAccountPageSchema,
  finAccountSchema,
  finBudgetPageSchema,
  finBudgetSchema,
  finRecurringPageSchema,
  finRecurringSchema,
  finReportSchema,
  finSavingsGoalPageSchema,
  finSavingsGoalSchema,
  finTransactionPageSchema,
  finTransactionSchema,
  handoverPageSchema,
  handoverSchema,
  pointsViewSchema,
  barcodeProductSchema,
  mealPlanEntryPageSchema,
  mealPlanEntrySchema,
  pantryItemPageSchema,
  pantryItemSchema,
  recipeImportSchema,
  recipePageSchema,
  recipeSchema,
  residentAboutCardSchema,
  rewardPageSchema,
  rewardRedemptionPageSchema,
  rewardRedemptionSchema,
  rewardSchema,
  shoppingItemPageSchema,
  shoppingItemSchema,
  shoppingListPageSchema,
  shoppingListSchema,
  storePageSchema,
  storeSchema,
  vitalEntryPageSchema,
  vitalEntrySchema,
  type CreateFinAccountRequest,
  type CreateFinBudgetRequest,
  type CreateFinRecurringRequest,
  type CreateFinSavingsGoalRequest,
  type CreateFinTransactionRequest,
  type FinAccount,
  type FinBudget,
  type FinRecurring,
  type FinReport,
  type FinReportKind,
  type FinSavingsGoal,
  type FinTransaction,
  type PutFinSplitsRequest,
  auditEventListSchema,
  revisionListSchema,
  revisionSchema,
  type AuditEvent,
  type RestoreRevisionRequest,
  type Revision,
  createHaConnectionResponseSchema,
  haConnectionPageSchema,
  haConnectionTestResultSchema,
  haDevicePageSchema,
  haLockCodePageSchema,
  haRefreshResultSchema,
  haZonePageSchema,
  haZoneSchema,
  issueHaLockCodeResponseSchema,
  type CreateHaConnectionRequest,
  type CreateHaConnectionResponse,
  type CreateHaZoneRequest,
  type HaConnection,
  type HaConnectionTestResult,
  type HaDevice,
  type HaLockCode,
  type HaRefreshResult,
  type HaZone,
  type IssueHaLockCodeRequest,
  type IssueHaLockCodeResponse,
  type UpdateHaZoneRequest,
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
   * Rooms of one house.
   *
   * @param familyId - Family id.
   * @param houseId - House id.
   * @returns Every page.
   */
  listRooms(familyId: string, houseId: string): Promise<readonly Room[]>;
  /**
   * Adds a room.
   *
   * @param familyId - Family id.
   * @param houseId - House id.
   * @param body - Manual fields.
   * @param idempotencyKey - UUID for this attempt.
   * @returns The room.
   */
  createRoom(
    familyId: string,
    houseId: string,
    body: CreateRoomRequest,
    idempotencyKey: string,
  ): Promise<Room>;
  /**
   * Updates a room.
   *
   * @param familyId - Family id.
   * @param houseId - House id.
   * @param roomId - Room id.
   * @param version - Version the form was loaded with.
   * @param patch - Manual fields.
   * @returns The room.
   */
  updateRoom(
    familyId: string,
    houseId: string,
    roomId: string,
    version: number,
    patch: UpdateRoomRequest,
  ): Promise<Room>;
  /**
   * Moves a room to the trash.
   *
   * @param familyId - Family id.
   * @param houseId - House id.
   * @param roomId - Room id.
   * @param version - Version the form was loaded with.
   */
  deleteRoom(familyId: string, houseId: string, roomId: string, version: number): Promise<void>;
  /**
   * Closets and containers of one house.
   *
   * @param familyId - Family id.
   * @param houseId - House id.
   * @param roomId - Optional room filter.
   * @returns Every page.
   */
  listStorageUnits(familyId: string, houseId: string, roomId?: string): Promise<readonly StorageUnit[]>;
  /**
   * Adds a closet or container.
   *
   * @param familyId - Family id.
   * @param houseId - House id.
   * @param body - Manual fields.
   * @param idempotencyKey - UUID for this attempt.
   * @returns The unit.
   */
  createStorageUnit(
    familyId: string,
    houseId: string,
    body: CreateStorageUnitRequest,
    idempotencyKey: string,
  ): Promise<StorageUnit>;
  /**
   * Updates a closet or container.
   *
   * @param familyId - Family id.
   * @param houseId - House id.
   * @param unitId - Unit id.
   * @param version - Version the form was loaded with.
   * @param patch - Manual fields.
   * @returns The unit.
   */
  updateStorageUnit(
    familyId: string,
    houseId: string,
    unitId: string,
    version: number,
    patch: UpdateStorageUnitRequest,
  ): Promise<StorageUnit>;
  /**
   * Moves a closet or container to the trash.
   *
   * @param familyId - Family id.
   * @param houseId - House id.
   * @param unitId - Unit id.
   * @param version - Version the form was loaded with.
   */
  deleteStorageUnit(familyId: string, houseId: string, unitId: string, version: number): Promise<void>;
  /**
   * Inventory items of one house.
   *
   * @param familyId - Family id.
   * @param houseId - House id.
   * @param filter - Optional room or storage filter.
   * @returns Every page.
   */
  listInventoryItems(
    familyId: string,
    houseId: string,
    filter?: { readonly roomId?: string; readonly storageUnitId?: string },
  ): Promise<readonly InventoryItem[]>;
  /**
   * Adds an inventory item.
   *
   * @param familyId - Family id.
   * @param houseId - House id.
   * @param body - Manual fields.
   * @param idempotencyKey - UUID for this attempt.
   * @returns The item.
   */
  createInventoryItem(
    familyId: string,
    houseId: string,
    body: CreateInventoryItemRequest,
    idempotencyKey: string,
  ): Promise<InventoryItem>;
  /**
   * Updates an inventory item.
   *
   * @param familyId - Family id.
   * @param houseId - House id.
   * @param itemId - Item id.
   * @param version - Version the form was loaded with.
   * @param patch - Manual fields.
   * @returns The item.
   */
  updateInventoryItem(
    familyId: string,
    houseId: string,
    itemId: string,
    version: number,
    patch: UpdateInventoryItemRequest,
  ): Promise<InventoryItem>;
  /**
   * Moves an inventory item to the trash.
   *
   * @param familyId - Family id.
   * @param houseId - House id.
   * @param itemId - Item id.
   * @param version - Version the form was loaded with.
   */
  deleteInventoryItem(familyId: string, houseId: string, itemId: string, version: number): Promise<void>;
  /**
   * Full-text search over the house inventory.
   *
   * @param familyId - Family id.
   * @param houseId - House id.
   * @param query - Search text.
   * @param tag - Optional tag filter.
   * @returns Ranked hits.
   */
  searchInventory(
    familyId: string,
    houseId: string,
    query: string,
    tag?: string,
  ): Promise<InventorySearchResponse>;
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
   * Reads the «Chi sono» sheet.
   *
   * @param familyId - Family id.
   * @param residentId - Person id.
   * @returns The sheet, empty when never written.
   */
  getAbout(familyId: string, residentId: string): Promise<ResidentAboutCard>;
  /**
   * Replaces the «Chi sono» sheet.
   *
   * @param familyId - Family id.
   * @param residentId - Person id.
   * @param version - Version the form was loaded with.
   * @param body - The whole sheet.
   * @returns The stored sheet.
   */
  putAbout(
    familyId: string,
    residentId: string,
    version: number,
    body: PutResidentAboutRequest,
  ): Promise<ResidentAboutCard>;
  /**
   * Lists vital diary rows for one person.
   *
   * @param familyId - Family id.
   * @param residentId - Person id.
   * @returns Every page, newest first.
   */
  listVitals(familyId: string, residentId: string): Promise<readonly VitalEntry[]>;
  /**
   * Adds a vital diary row.
   *
   * @param familyId - Family id.
   * @param residentId - Person id.
   * @param idempotencyKey - UUID for this attempt.
   * @param body - Measurements.
   * @returns The stored row.
   */
  createVital(
    familyId: string,
    residentId: string,
    idempotencyKey: string,
    body: CreateVitalEntryRequest,
  ): Promise<VitalEntry>;
  /**
   * Soft-deletes a vital diary row.
   *
   * @param familyId - Family id.
   * @param residentId - Person id.
   * @param entryId - Entry id.
   * @param version - Version the form was loaded with.
   */
  deleteVital(familyId: string, residentId: string, entryId: string, version: number): Promise<void>;
  /**
   * Lists handover notes for one house.
   *
   * @param familyId - Family id.
   * @param houseId - House id.
   * @returns Every page, newest first.
   */
  listHandovers(familyId: string, houseId: string): Promise<readonly Handover[]>;
  /**
   * Adds a handover note.
   *
   * @param familyId - Family id.
   * @param idempotencyKey - UUID for this attempt.
   * @param body - Note content.
   * @returns The stored note.
   */
  createHandover(familyId: string, idempotencyKey: string, body: CreateHandoverRequest): Promise<Handover>;
  /**
   * Marks a handover as read.
   *
   * @param familyId - Family id.
   * @param handoverId - Note id.
   * @param version - Version the client loaded.
   * @returns The acknowledged note.
   */
  acknowledgeHandover(familyId: string, handoverId: string, version: number): Promise<Handover>;
  /**
   * Soft-deletes a handover note.
   *
   * @param familyId - Family id.
   * @param handoverId - Note id.
   * @param version - Version the form was loaded with.
   */
  deleteHandover(familyId: string, handoverId: string, version: number): Promise<void>;
  /** Lists active chores for one house. */
  listChores(familyId: string, houseId: string): Promise<readonly Chore[]>;
  /** Creates a chore. */
  createChore(familyId: string, idempotencyKey: string, body: CreateChoreRequest): Promise<Chore>;
  /** Marks a chore completed, optionally with a proof photo. */
  completeChore(
    familyId: string,
    choreId: string,
    idempotencyKey: string,
    body: CreateChoreCompletionRequest,
  ): Promise<ChoreCompletion>;
  /** Lists chore completions, optionally filtered by status. */
  listChoreCompletions(
    familyId: string,
    status?: ChoreCompletion['status'],
  ): Promise<readonly ChoreCompletion[]>;
  /** Approves a pending chore completion. */
  approveChoreCompletion(familyId: string, completionId: string): Promise<ChoreCompletion>;
  /** Rejects a pending chore completion. */
  rejectChoreCompletion(familyId: string, completionId: string): Promise<ChoreCompletion>;
  /** Point balance, streak and ledger for one resident. */
  getPoints(familyId: string, residentId: string): Promise<PointsView>;
  /** Lists rewards in the family store. */
  listRewards(familyId: string): Promise<readonly Reward[]>;
  /** Adds a reward to the store. */
  createReward(familyId: string, idempotencyKey: string, body: CreateRewardRequest): Promise<Reward>;
  /** Requests a reward redemption for points. */
  requestRewardRedemption(
    familyId: string,
    rewardId: string,
    idempotencyKey: string,
    body: CreateRedemptionRequest,
  ): Promise<RewardRedemption>;
  /** Lists redemption requests. */
  listRedemptions(
    familyId: string,
    status?: RewardRedemption['status'],
  ): Promise<readonly RewardRedemption[]>;
  /** Approves a redemption and debits points. */
  approveRedemption(familyId: string, redemptionId: string, version: number): Promise<RewardRedemption>;
  /** Rejects a redemption. */
  rejectRedemption(familyId: string, redemptionId: string, version: number): Promise<RewardRedemption>;
  /** Lists family recipes. */
  listRecipes(familyId: string): Promise<readonly Recipe[]>;
  /** Creates a recipe by hand. */
  createRecipe(familyId: string, idempotencyKey: string, body: CreateRecipeRequest): Promise<Recipe>;
  /** Updates a recipe. */
  updateRecipe(
    familyId: string,
    recipeId: string,
    version: number,
    body: UpdateRecipeRequest,
  ): Promise<Recipe>;
  /** Soft-deletes a recipe. */
  deleteRecipe(familyId: string, recipeId: string, version: number): Promise<void>;
  /** Imports a recipe from a public page address. */
  importRecipe(
    familyId: string,
    idempotencyKey: string,
    body: CreateRecipeImportRequest,
  ): Promise<RecipeImport>;
  /** Lists family stores. */
  listStores(familyId: string): Promise<readonly Store[]>;
  /** Creates a store. */
  createStore(familyId: string, idempotencyKey: string, body: CreateStoreRequest): Promise<Store>;
  /** Updates a store. */
  updateStore(familyId: string, storeId: string, version: number, body: UpdateStoreRequest): Promise<Store>;
  /** Soft-deletes a store. */
  deleteStore(familyId: string, storeId: string, version: number): Promise<void>;
  /** Lists shopping lists for one house. */
  listShoppingLists(familyId: string, houseId: string): Promise<readonly ShoppingList[]>;
  /** Creates a shopping list. */
  createShoppingList(
    familyId: string,
    idempotencyKey: string,
    body: CreateShoppingListRequest,
  ): Promise<ShoppingList>;
  /** Updates a shopping list. */
  updateShoppingList(
    familyId: string,
    listId: string,
    version: number,
    body: UpdateShoppingListRequest,
  ): Promise<ShoppingList>;
  /** Soft-deletes a shopping list. */
  deleteShoppingList(familyId: string, listId: string, version: number): Promise<void>;
  /** Lists items on one shopping list. */
  listShoppingItems(familyId: string, listId: string): Promise<readonly ShoppingItem[]>;
  /** Adds an item to a shopping list. */
  createShoppingItem(
    familyId: string,
    listId: string,
    idempotencyKey: string,
    body: CreateShoppingItemRequest,
  ): Promise<ShoppingItem>;
  /** Updates a shopping item. */
  updateShoppingItem(
    familyId: string,
    listId: string,
    itemId: string,
    version: number,
    body: UpdateShoppingItemRequest,
  ): Promise<ShoppingItem>;
  /** Checks or unchecks a shopping item. */
  checkShoppingItem(
    familyId: string,
    listId: string,
    itemId: string,
    version: number,
    body: CheckShoppingItemRequest,
  ): Promise<ShoppingItem>;
  /** Soft-deletes a shopping item. */
  deleteShoppingItem(familyId: string, listId: string, itemId: string, version: number): Promise<void>;
  /** Lists meal plan entries between two calendar dates. */
  listMealPlan(
    familyId: string,
    from: string,
    to: string,
    houseId?: string,
  ): Promise<readonly MealPlanEntry[]>;
  /** Adds a meal to the weekly plan. */
  createMealPlanEntry(
    familyId: string,
    idempotencyKey: string,
    body: CreateMealPlanEntryRequest,
  ): Promise<MealPlanEntry>;
  /** Updates a meal plan entry. */
  updateMealPlanEntry(
    familyId: string,
    entryId: string,
    version: number,
    body: UpdateMealPlanEntryRequest,
  ): Promise<MealPlanEntry>;
  /** Deletes a meal plan entry. */
  deleteMealPlanEntry(familyId: string, entryId: string, version: number): Promise<void>;
  /** Lists pantry stock for one house. */
  listPantryItems(familyId: string, houseId: string): Promise<readonly PantryItem[]>;
  /** Adds a pantry item by hand. */
  createPantryItem(
    familyId: string,
    houseId: string,
    idempotencyKey: string,
    body: CreatePantryItemRequest,
  ): Promise<PantryItem>;
  /** Updates a pantry item. */
  updatePantryItem(
    familyId: string,
    houseId: string,
    itemId: string,
    version: number,
    body: UpdatePantryItemRequest,
  ): Promise<PantryItem>;
  /** Soft-deletes a pantry item. */
  deletePantryItem(familyId: string, houseId: string, itemId: string, version: number): Promise<void>;
  /** Looks up a remembered barcode product. */
  getBarcodeProduct(familyId: string, code: string): Promise<BarcodeProduct>;
  /** Remembers a product by barcode. */
  upsertBarcodeProduct(
    familyId: string,
    code: string,
    idempotencyKey: string,
    body: UpsertBarcodeProductRequest,
  ): Promise<BarcodeProduct>;
  /** Lists family ledger accounts. */
  listFinanceAccounts(familyId: string): Promise<readonly FinAccount[]>;
  /** Creates a ledger account by hand. */
  createFinanceAccount(
    familyId: string,
    idempotencyKey: string,
    body: CreateFinAccountRequest,
  ): Promise<FinAccount>;
  /** Lists finance transactions. */
  listFinanceTransactions(familyId: string): Promise<readonly FinTransaction[]>;
  /** Creates a double-entry transaction by hand. */
  createFinanceTransaction(
    familyId: string,
    idempotencyKey: string,
    body: CreateFinTransactionRequest,
  ): Promise<FinTransaction>;
  /** Replaces expense split shares on a transaction. */
  putFinanceSplits(
    familyId: string,
    transactionId: string,
    idempotencyKey: string,
    body: PutFinSplitsRequest,
  ): Promise<FinTransaction>;
  /** Lists budgets. */
  listFinanceBudgets(familyId: string): Promise<readonly FinBudget[]>;
  /** Creates a budget by hand. */
  createFinanceBudget(
    familyId: string,
    idempotencyKey: string,
    body: CreateFinBudgetRequest,
  ): Promise<FinBudget>;
  /** Lists savings goals. */
  listFinanceSavingsGoals(familyId: string): Promise<readonly FinSavingsGoal[]>;
  /** Creates a savings goal by hand. */
  createFinanceSavingsGoal(
    familyId: string,
    idempotencyKey: string,
    body: CreateFinSavingsGoalRequest,
  ): Promise<FinSavingsGoal>;
  /** Lists recurring transaction templates. */
  listFinanceRecurring(familyId: string): Promise<readonly FinRecurring[]>;
  /** Creates a recurring template by hand. */
  createFinanceRecurring(
    familyId: string,
    idempotencyKey: string,
    body: CreateFinRecurringRequest,
  ): Promise<FinRecurring>;
  /** Loads a finance report for a date range. */
  getFinanceReport(familyId: string, kind: FinReportKind, from: string, to: string): Promise<FinReport>;
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
   * Reading log of the public codes, newest first.
   *
   * Preconditions: the caller can edit the house and the plan is Premium or the trial.
   * Postconditions: lower plans and other roles are refused by the server.
   * Data contract: each item is the time, the code kind and the device label.
   *
   * @param familyId - Family id.
   * @param houseId - House id.
   * @returns The readings.
   */
  listPublicationReadings(familyId: string, houseId: string): Promise<readonly PublicationReading[]>;
  /**
   * Family audit history for administrators on Premium or the trial.
   *
   * @param familyId - Family id.
   * @returns Newest events first.
   */
  listAuditEvents(familyId: string): Promise<readonly AuditEvent[]>;
  /**
   * Revision history of one resource.
   *
   * @param familyId - Family id.
   * @param resourceType - Resource table name.
   * @param resourceId - Resource id.
   * @returns Newest revisions first.
   */
  listRevisions(familyId: string, resourceType: string, resourceId: string): Promise<readonly Revision[]>;
  /**
   * Restores a resource from a previous revision.
   *
   * @param familyId - Family id.
   * @param revisionId - Revision id.
   * @param body - Optional sealed envelope.
   * @param idempotencyKey - UUID for this attempt.
   * @returns The newly appended restore revision.
   */
  restoreRevision(
    familyId: string,
    revisionId: string,
    body: RestoreRevisionRequest,
    idempotencyKey: string,
  ): Promise<Revision>;
  /**
   * Home-automation connections of a house (Premium).
   *
   * @param familyId - Family id.
   * @param houseId - House id.
   * @returns Connections without secrets.
   */
  listAutomationConnections(familyId: string, houseId: string): Promise<readonly HaConnection[]>;
  /**
   * Creates a Home Assistant or MQTT connection.
   *
   * @param familyId - Family id.
   * @param houseId - House id.
   * @param idempotencyKey - UUID for this attempt.
   * @param body - Connection settings.
   * @returns Connection and optional inbound secret.
   */
  createAutomationConnection(
    familyId: string,
    houseId: string,
    idempotencyKey: string,
    body: CreateHaConnectionRequest,
  ): Promise<CreateHaConnectionResponse>;
  /**
   * Probes a connection through the bridge adapter.
   *
   * @param familyId - Family id.
   * @param houseId - House id.
   * @param connectionId - Connection id.
   * @param idempotencyKey - UUID for this attempt.
   * @returns Probe result.
   */
  testAutomationConnection(
    familyId: string,
    houseId: string,
    connectionId: string,
    idempotencyKey: string,
  ): Promise<HaConnectionTestResult>;
  /**
   * Refreshes entity status through the bridge adapter.
   *
   * @param familyId - Family id.
   * @param houseId - House id.
   * @param connectionId - Connection id.
   * @param idempotencyKey - UUID for this attempt.
   * @returns Upserted devices.
   */
  refreshAutomationDevices(
    familyId: string,
    houseId: string,
    connectionId: string,
    idempotencyKey: string,
  ): Promise<HaRefreshResult>;
  /**
   * Home-automation devices of a house.
   *
   * @param familyId - Family id.
   * @param houseId - House id.
   * @returns Devices with latest status.
   */
  listAutomationDevices(familyId: string, houseId: string): Promise<readonly HaDevice[]>;
  /**
   * Zone alarms of a house.
   *
   * @param familyId - Family id.
   * @param houseId - House id.
   * @returns Zones.
   */
  listAutomationZones(familyId: string, houseId: string): Promise<readonly HaZone[]>;
  /**
   * Creates a zone alarm.
   *
   * @param familyId - Family id.
   * @param houseId - House id.
   * @param idempotencyKey - UUID for this attempt.
   * @param body - Zone fields.
   * @returns The created zone.
   */
  createAutomationZone(
    familyId: string,
    houseId: string,
    idempotencyKey: string,
    body: CreateHaZoneRequest,
  ): Promise<HaZone>;
  /**
   * Updates a zone or changes its armed state.
   *
   * @param familyId - Family id.
   * @param houseId - House id.
   * @param zoneId - Zone id.
   * @param version - Stored version.
   * @param body - Patch.
   * @returns The updated zone.
   */
  updateAutomationZone(
    familyId: string,
    houseId: string,
    zoneId: string,
    version: number,
    body: UpdateHaZoneRequest,
  ): Promise<HaZone>;
  /**
   * Temporary smart-lock codes of a house.
   *
   * @param familyId - Family id.
   * @param houseId - House id.
   * @returns Lock code metadata.
   */
  listAutomationLockCodes(familyId: string, houseId: string): Promise<readonly HaLockCode[]>;
  /**
   * Issues a temporary smart-lock code.
   *
   * @param familyId - Family id.
   * @param houseId - House id.
   * @param deviceId - Lock device id.
   * @param idempotencyKey - UUID for this attempt.
   * @param body - Label and validity window.
   * @returns Metadata and plaintext code.
   */
  issueAutomationLockCode(
    familyId: string,
    houseId: string,
    deviceId: string,
    idempotencyKey: string,
    body: IssueHaLockCodeRequest,
  ): Promise<IssueHaLockCodeResponse>;
  /**
   * Stored host mark of a family.
   *
   * Preconditions: the caller can prepare printed sheets and the plan includes branding.
   * Postconditions: null when the family has not saved a mark.
   * Data contract: name, color, welcome sentence, logo address and version.
   *
   * @param familyId - Family id.
   * @returns The mark, or null.
   */
  getBranding(familyId: string): Promise<FamilyBranding | null>;
  /**
   * Replaces the host mark, or clears it when every field is null.
   *
   * Preconditions: the caller is an administrator on Premium or the trial.
   * Postconditions: a missing version is sent only when no mark is stored yet.
   * Data contract: the same four fields. The logo stays a small data address.
   *
   * @param familyId - Family id.
   * @param version - Stored version, or null when creating the mark.
   * @param body - The whole mark.
   * @param idempotencyKey - UUID for this attempt.
   * @returns The stored mark, or null when it was cleared.
   */
  putBranding(
    familyId: string,
    version: number | null,
    body: PutFamilyBrandingRequest,
    idempotencyKey: string,
  ): Promise<FamilyBranding | null>;
  /**
   * Public house page. No session is required.
   *
   * Preconditions: `deviceLabel` is a closed label, or null when the browser did not send one.
   * Postconditions: the server records the opening.
   * Data contract: shutoffs, tradespeople and the primary contact.
   *
   * @param token - Token from the printed address.
   * @param deviceLabel - Short device label, or null.
   * @returns The public house page.
   */
  getPublicHousePage(token: string, deviceLabel: DeviceLabel | null): Promise<PublicHousePage>;
  /**
   * Public rescue sheet. No session is required.
   *
   * Preconditions: `deviceLabel` is a closed label, or null when the browser did not send one.
   * Postconditions: the server records the opening.
   * Data contract: the rescue sheet of that house.
   *
   * @param token - Token from the printed address.
   * @param deviceLabel - Short device label, or null.
   * @returns The rescue sheet.
   */
  getPublicRescueSheet(token: string, deviceLabel: DeviceLabel | null): Promise<PublicRescueSheet>;
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
  /**
   * Deadlines of the open house, grouped in the family time zone.
   *
   * @param familyId - Family id.
   * @param houseId - Open house. Maintenance is limited to this house.
   * @returns Overdue, this week and this month.
   */
  listDeadlines(familyId: string, houseId: string): Promise<DeadlineBoard>;
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

function deviceHeaders(deviceLabel: DeviceLabel | null): { readonly [HEADERS.device]?: DeviceLabel } {
  if (deviceLabel === null) {
    return {};
  }
  return { [HEADERS.device]: deviceLabel };
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
    async listDeadlines(familyId, houseId) {
      const result = await client.GET('/api/v1/families/{familyId}/deadlines', {
        params: { path: { familyId }, query: { houseId } },
      });
      return unwrap(deadlineBoardSchema, result);
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
    listRooms(familyId, houseId) {
      return collect((cursor) =>
        client
          .GET('/api/v1/families/{familyId}/houses/{houseId}/rooms', {
            params: {
              path: { familyId, houseId },
              query: { limit: 200, ...(cursor === undefined ? {} : { cursor }) },
            },
          })
          .then((result) => unwrap(roomPageSchema, result)),
      );
    },
    async createRoom(familyId, houseId, body, idempotencyKey) {
      const result = await client.POST('/api/v1/families/{familyId}/houses/{houseId}/rooms', {
        params: { path: { familyId, houseId } },
        body: body as components['schemas']['CreateRoomRequestInput'],
        headers: { [HEADERS.idempotencyKey]: idempotencyKey },
      });
      return unwrap(roomSchema, result);
    },
    async updateRoom(familyId, houseId, roomId, version, patch) {
      const result = await client.PATCH('/api/v1/families/{familyId}/houses/{houseId}/rooms/{roomId}', {
        params: { path: { familyId, houseId, roomId } },
        body: patch as components['schemas']['UpdateRoomRequestInput'],
        headers: { [HEADERS.ifMatch]: formatEtag(version) },
      });
      return unwrap(roomSchema, result);
    },
    async deleteRoom(familyId, houseId, roomId, version) {
      const result = await client.DELETE('/api/v1/families/{familyId}/houses/{houseId}/rooms/{roomId}', {
        params: { path: { familyId, houseId, roomId } },
        headers: { [HEADERS.ifMatch]: formatEtag(version) },
      });
      ensureOk(result);
    },
    listStorageUnits(familyId, houseId, roomId) {
      return collect((cursor) =>
        client
          .GET('/api/v1/families/{familyId}/houses/{houseId}/storage-units', {
            params: {
              path: { familyId, houseId },
              query: {
                limit: 200,
                ...(cursor === undefined ? {} : { cursor }),
                ...(roomId === undefined ? {} : { roomId }),
              },
            },
          })
          .then((result) => unwrap(storageUnitPageSchema, result)),
      );
    },
    async createStorageUnit(familyId, houseId, body, idempotencyKey) {
      const result = await client.POST('/api/v1/families/{familyId}/houses/{houseId}/storage-units', {
        params: { path: { familyId, houseId } },
        body: body as components['schemas']['CreateStorageUnitRequestInput'],
        headers: { [HEADERS.idempotencyKey]: idempotencyKey },
      });
      return unwrap(storageUnitSchema, result);
    },
    async updateStorageUnit(familyId, houseId, unitId, version, patch) {
      const result = await client.PATCH(
        '/api/v1/families/{familyId}/houses/{houseId}/storage-units/{unitId}',
        {
          params: { path: { familyId, houseId, unitId } },
          body: patch as components['schemas']['UpdateStorageUnitRequestInput'],
          headers: { [HEADERS.ifMatch]: formatEtag(version) },
        },
      );
      return unwrap(storageUnitSchema, result);
    },
    async deleteStorageUnit(familyId, houseId, unitId, version) {
      const result = await client.DELETE(
        '/api/v1/families/{familyId}/houses/{houseId}/storage-units/{unitId}',
        {
          params: { path: { familyId, houseId, unitId } },
          headers: { [HEADERS.ifMatch]: formatEtag(version) },
        },
      );
      ensureOk(result);
    },
    listInventoryItems(familyId, houseId, filter) {
      return collect((cursor) =>
        client
          .GET('/api/v1/families/{familyId}/houses/{houseId}/inventory-items', {
            params: {
              path: { familyId, houseId },
              query: {
                limit: 200,
                ...(cursor === undefined ? {} : { cursor }),
                ...(filter?.roomId === undefined ? {} : { roomId: filter.roomId }),
                ...(filter?.storageUnitId === undefined ? {} : { storageUnitId: filter.storageUnitId }),
              },
            },
          })
          .then((result) => unwrap(inventoryItemPageSchema, result)),
      );
    },
    async createInventoryItem(familyId, houseId, body, idempotencyKey) {
      const result = await client.POST('/api/v1/families/{familyId}/houses/{houseId}/inventory-items', {
        params: { path: { familyId, houseId } },
        body: body as components['schemas']['CreateInventoryItemRequestInput'],
        headers: { [HEADERS.idempotencyKey]: idempotencyKey },
      });
      return unwrap(inventoryItemSchema, result);
    },
    async updateInventoryItem(familyId, houseId, itemId, version, patch) {
      const result = await client.PATCH(
        '/api/v1/families/{familyId}/houses/{houseId}/inventory-items/{itemId}',
        {
          params: { path: { familyId, houseId, itemId } },
          body: patch as components['schemas']['UpdateInventoryItemRequestInput'],
          headers: { [HEADERS.ifMatch]: formatEtag(version) },
        },
      );
      return unwrap(inventoryItemSchema, result);
    },
    async deleteInventoryItem(familyId, houseId, itemId, version) {
      const result = await client.DELETE(
        '/api/v1/families/{familyId}/houses/{houseId}/inventory-items/{itemId}',
        {
          params: { path: { familyId, houseId, itemId } },
          headers: { [HEADERS.ifMatch]: formatEtag(version) },
        },
      );
      ensureOk(result);
    },
    async searchInventory(familyId, houseId, query, tag) {
      const result = await client.GET('/api/v1/families/{familyId}/houses/{houseId}/inventory/search', {
        params: {
          path: { familyId, houseId },
          query: { q: query, ...(tag === undefined ? {} : { tag }) },
        },
      });
      return unwrap(inventorySearchResponseSchema, result);
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
    async getAbout(familyId, residentId) {
      const result = await client.GET('/api/v1/families/{familyId}/residents/{residentId}/about', {
        params: { path: { familyId, residentId } },
      });
      return unwrap(residentAboutCardSchema, result);
    },
    async putAbout(familyId, residentId, version, body) {
      const result = await client.PUT('/api/v1/families/{familyId}/residents/{residentId}/about', {
        params: { path: { familyId, residentId } },
        body,
        headers: {
          [HEADERS.ifMatch]: formatEtag(version),
          [HEADERS.idempotencyKey]: crypto.randomUUID(),
        },
      });
      return unwrap(residentAboutCardSchema, result);
    },
    listVitals(familyId, residentId) {
      return collect((cursor) =>
        client
          .GET('/api/v1/families/{familyId}/residents/{residentId}/vitals', {
            params: {
              path: { familyId, residentId },
              query: { limit: 200, ...(cursor === undefined ? {} : { cursor }) },
            },
          })
          .then((result) => unwrap(vitalEntryPageSchema, result)),
      );
    },
    async createVital(familyId, residentId, idempotencyKey, body) {
      const result = await client.POST('/api/v1/families/{familyId}/residents/{residentId}/vitals', {
        params: { path: { familyId, residentId } },
        body: body as components['schemas']['CreateVitalEntryRequestInput'],
        headers: { [HEADERS.idempotencyKey]: idempotencyKey },
      });
      return unwrap(vitalEntrySchema, result);
    },
    async deleteVital(familyId, residentId, entryId, version) {
      const result = await client.DELETE(
        '/api/v1/families/{familyId}/residents/{residentId}/vitals/{entryId}',
        {
          params: { path: { familyId, residentId, entryId } },
          headers: { [HEADERS.ifMatch]: formatEtag(version) },
        },
      );
      ensureOk(result);
    },
    listHandovers(familyId, houseId) {
      return collect((cursor) =>
        client
          .GET('/api/v1/families/{familyId}/handovers', {
            params: {
              path: { familyId },
              query: { limit: 200, houseId, ...(cursor === undefined ? {} : { cursor }) },
            },
          })
          .then((result) => unwrap(handoverPageSchema, result)),
      );
    },
    async createHandover(familyId, idempotencyKey, body) {
      const result = await client.POST('/api/v1/families/{familyId}/handovers', {
        params: { path: { familyId } },
        body: body as components['schemas']['CreateHandoverRequestInput'],
        headers: { [HEADERS.idempotencyKey]: idempotencyKey },
      });
      return unwrap(handoverSchema, result);
    },
    async acknowledgeHandover(familyId, handoverId, version) {
      const result = await client.POST('/api/v1/families/{familyId}/handovers/{handoverId}/acknowledge', {
        params: { path: { familyId, handoverId } },
        headers: {
          [HEADERS.ifMatch]: formatEtag(version),
          [HEADERS.idempotencyKey]: crypto.randomUUID(),
        },
      });
      return unwrap(handoverSchema, result);
    },
    async deleteHandover(familyId, handoverId, version) {
      const result = await client.DELETE('/api/v1/families/{familyId}/handovers/{handoverId}', {
        params: { path: { familyId, handoverId } },
        headers: { [HEADERS.ifMatch]: formatEtag(version) },
      });
      ensureOk(result);
    },
    listChores(familyId, houseId) {
      return collect((cursor) =>
        client
          .GET('/api/v1/families/{familyId}/chores', {
            params: {
              path: { familyId },
              query: { limit: 200, houseId, active: true, ...(cursor === undefined ? {} : { cursor }) },
            },
          })
          .then((result) => unwrap(chorePageSchema, result)),
      );
    },
    async createChore(familyId, idempotencyKey, body) {
      const result = await client.POST('/api/v1/families/{familyId}/chores', {
        params: { path: { familyId } },
        body: body as components['schemas']['CreateChoreRequestInput'],
        headers: { [HEADERS.idempotencyKey]: idempotencyKey },
      });
      return unwrap(choreSchema, result);
    },
    async completeChore(familyId, choreId, idempotencyKey, body) {
      const result = await client.POST('/api/v1/families/{familyId}/chores/{choreId}/completions', {
        params: { path: { familyId, choreId } },
        body: body as components['schemas']['CreateChoreCompletionRequestInput'],
        headers: { [HEADERS.idempotencyKey]: idempotencyKey },
      });
      return unwrap(choreCompletionSchema, result);
    },
    listChoreCompletions(familyId, status) {
      return collect((cursor) =>
        client
          .GET('/api/v1/families/{familyId}/chore-completions', {
            params: {
              path: { familyId },
              query: {
                limit: 200,
                ...(status === undefined ? {} : { status }),
                ...(cursor === undefined ? {} : { cursor }),
              },
            },
          })
          .then((result) => unwrap(choreCompletionPageSchema, result)),
      );
    },
    async approveChoreCompletion(familyId, completionId) {
      const result = await client.POST(
        '/api/v1/families/{familyId}/chore-completions/{completionId}/approve',
        {
          params: { path: { familyId, completionId } },
          headers: { [HEADERS.idempotencyKey]: crypto.randomUUID() },
        },
      );
      return unwrap(choreCompletionSchema, result);
    },
    async rejectChoreCompletion(familyId, completionId) {
      const result = await client.POST(
        '/api/v1/families/{familyId}/chore-completions/{completionId}/reject',
        {
          params: { path: { familyId, completionId } },
          headers: { [HEADERS.idempotencyKey]: crypto.randomUUID() },
        },
      );
      return unwrap(choreCompletionSchema, result);
    },
    async getPoints(familyId, residentId) {
      const result = await client.GET('/api/v1/families/{familyId}/points', {
        params: { path: { familyId }, query: { residentId, limit: 50 } },
      });
      return unwrap(pointsViewSchema, result);
    },
    listRewards(familyId) {
      return collect((cursor) =>
        client
          .GET('/api/v1/families/{familyId}/rewards', {
            params: {
              path: { familyId },
              query: { limit: 200, active: true, ...(cursor === undefined ? {} : { cursor }) },
            },
          })
          .then((result) => unwrap(rewardPageSchema, result)),
      );
    },
    async createReward(familyId, idempotencyKey, body) {
      const result = await client.POST('/api/v1/families/{familyId}/rewards', {
        params: { path: { familyId } },
        body: body as components['schemas']['CreateRewardRequestInput'],
        headers: { [HEADERS.idempotencyKey]: idempotencyKey },
      });
      return unwrap(rewardSchema, result);
    },
    async requestRewardRedemption(familyId, rewardId, idempotencyKey, body) {
      const result = await client.POST('/api/v1/families/{familyId}/rewards/{rewardId}/redemptions', {
        params: { path: { familyId, rewardId } },
        body,
        headers: { [HEADERS.idempotencyKey]: idempotencyKey },
      });
      return unwrap(rewardRedemptionSchema, result);
    },
    listRedemptions(familyId, status) {
      return collect((cursor) =>
        client
          .GET('/api/v1/families/{familyId}/redemptions', {
            params: {
              path: { familyId },
              query: {
                limit: 200,
                ...(status === undefined ? {} : { status }),
                ...(cursor === undefined ? {} : { cursor }),
              },
            },
          })
          .then((result) => unwrap(rewardRedemptionPageSchema, result)),
      );
    },
    async approveRedemption(familyId, redemptionId, version) {
      const result = await client.POST('/api/v1/families/{familyId}/redemptions/{redemptionId}/approve', {
        params: { path: { familyId, redemptionId } },
        headers: {
          [HEADERS.ifMatch]: formatEtag(version),
          [HEADERS.idempotencyKey]: crypto.randomUUID(),
        },
      });
      return unwrap(rewardRedemptionSchema, result);
    },
    async rejectRedemption(familyId, redemptionId, version) {
      const result = await client.POST('/api/v1/families/{familyId}/redemptions/{redemptionId}/reject', {
        params: { path: { familyId, redemptionId } },
        headers: {
          [HEADERS.ifMatch]: formatEtag(version),
          [HEADERS.idempotencyKey]: crypto.randomUUID(),
        },
      });
      return unwrap(rewardRedemptionSchema, result);
    },
    listRecipes(familyId) {
      return collect((cursor) =>
        client
          .GET('/api/v1/families/{familyId}/recipes', {
            params: {
              path: { familyId },
              query: { limit: 200, ...(cursor === undefined ? {} : { cursor }) },
            },
          })
          .then((result) => unwrap(recipePageSchema, result)),
      );
    },
    async createRecipe(familyId, idempotencyKey, body) {
      const result = await client.POST('/api/v1/families/{familyId}/recipes', {
        params: { path: { familyId } },
        body: body as components['schemas']['CreateRecipeRequestInput'],
        headers: { [HEADERS.idempotencyKey]: idempotencyKey },
      });
      return unwrap(recipeSchema, result);
    },
    async updateRecipe(familyId, recipeId, version, body) {
      const result = await client.PATCH('/api/v1/families/{familyId}/recipes/{recipeId}', {
        params: { path: { familyId, recipeId } },
        body: body as components['schemas']['UpdateRecipeRequestInput'],
        headers: { [HEADERS.ifMatch]: formatEtag(version) },
      });
      return unwrap(recipeSchema, result);
    },
    async deleteRecipe(familyId, recipeId, version) {
      const result = await client.DELETE('/api/v1/families/{familyId}/recipes/{recipeId}', {
        params: { path: { familyId, recipeId } },
        headers: { [HEADERS.ifMatch]: formatEtag(version) },
      });
      ensureOk(result);
    },
    async importRecipe(familyId, idempotencyKey, body) {
      const result = await client.POST('/api/v1/families/{familyId}/recipe-imports', {
        params: { path: { familyId } },
        body,
        headers: { [HEADERS.idempotencyKey]: idempotencyKey },
      });
      return unwrap(recipeImportSchema, result);
    },
    listStores(familyId) {
      return collect((cursor) =>
        client
          .GET('/api/v1/families/{familyId}/stores', {
            params: {
              path: { familyId },
              query: { limit: 200, ...(cursor === undefined ? {} : { cursor }) },
            },
          })
          .then((result) => unwrap(storePageSchema, result)),
      );
    },
    async createStore(familyId, idempotencyKey, body) {
      const result = await client.POST('/api/v1/families/{familyId}/stores', {
        params: { path: { familyId } },
        body: body as components['schemas']['CreateStoreRequestInput'],
        headers: { [HEADERS.idempotencyKey]: idempotencyKey },
      });
      return unwrap(storeSchema, result);
    },
    async updateStore(familyId, storeId, version, body) {
      const result = await client.PATCH('/api/v1/families/{familyId}/stores/{storeId}', {
        params: { path: { familyId, storeId } },
        body: body as components['schemas']['UpdateStoreRequestInput'],
        headers: { [HEADERS.ifMatch]: formatEtag(version) },
      });
      return unwrap(storeSchema, result);
    },
    async deleteStore(familyId, storeId, version) {
      const result = await client.DELETE('/api/v1/families/{familyId}/stores/{storeId}', {
        params: { path: { familyId, storeId } },
        headers: { [HEADERS.ifMatch]: formatEtag(version) },
      });
      ensureOk(result);
    },
    listShoppingLists(familyId, houseId) {
      return collect((cursor) =>
        client
          .GET('/api/v1/families/{familyId}/shopping-lists', {
            params: {
              path: { familyId },
              query: {
                limit: 200,
                houseId,
                archived: false,
                ...(cursor === undefined ? {} : { cursor }),
              },
            },
          })
          .then((result) => unwrap(shoppingListPageSchema, result)),
      );
    },
    async createShoppingList(familyId, idempotencyKey, body) {
      const result = await client.POST('/api/v1/families/{familyId}/shopping-lists', {
        params: { path: { familyId } },
        body: body as components['schemas']['CreateShoppingListRequestInput'],
        headers: { [HEADERS.idempotencyKey]: idempotencyKey },
      });
      return unwrap(shoppingListSchema, result);
    },
    async updateShoppingList(familyId, listId, version, body) {
      const result = await client.PATCH('/api/v1/families/{familyId}/shopping-lists/{listId}', {
        params: { path: { familyId, listId } },
        body: body as components['schemas']['UpdateShoppingListRequestInput'],
        headers: { [HEADERS.ifMatch]: formatEtag(version) },
      });
      return unwrap(shoppingListSchema, result);
    },
    async deleteShoppingList(familyId, listId, version) {
      const result = await client.DELETE('/api/v1/families/{familyId}/shopping-lists/{listId}', {
        params: { path: { familyId, listId } },
        headers: { [HEADERS.ifMatch]: formatEtag(version) },
      });
      ensureOk(result);
    },
    listShoppingItems(familyId, listId) {
      return collect((cursor) =>
        client
          .GET('/api/v1/families/{familyId}/shopping-lists/{listId}/items', {
            params: {
              path: { familyId, listId },
              query: { limit: 200, ...(cursor === undefined ? {} : { cursor }) },
            },
          })
          .then((result) => unwrap(shoppingItemPageSchema, result)),
      );
    },
    async createShoppingItem(familyId, listId, idempotencyKey, body) {
      const result = await client.POST('/api/v1/families/{familyId}/shopping-lists/{listId}/items', {
        params: { path: { familyId, listId } },
        body: body as components['schemas']['CreateShoppingItemRequestInput'],
        headers: { [HEADERS.idempotencyKey]: idempotencyKey },
      });
      return unwrap(shoppingItemSchema, result);
    },
    async updateShoppingItem(familyId, listId, itemId, version, body) {
      const result = await client.PATCH(
        '/api/v1/families/{familyId}/shopping-lists/{listId}/items/{itemId}',
        {
          params: { path: { familyId, listId, itemId } },
          body: body as components['schemas']['UpdateShoppingItemRequestInput'],
          headers: { [HEADERS.ifMatch]: formatEtag(version) },
        },
      );
      return unwrap(shoppingItemSchema, result);
    },
    async checkShoppingItem(familyId, listId, itemId, version, body) {
      const result = await client.POST(
        '/api/v1/families/{familyId}/shopping-lists/{listId}/items/{itemId}/check',
        {
          params: { path: { familyId, listId, itemId } },
          body,
          headers: {
            [HEADERS.ifMatch]: formatEtag(version),
            [HEADERS.idempotencyKey]: crypto.randomUUID(),
          },
        },
      );
      return unwrap(shoppingItemSchema, result);
    },
    async deleteShoppingItem(familyId, listId, itemId, version) {
      const result = await client.DELETE(
        '/api/v1/families/{familyId}/shopping-lists/{listId}/items/{itemId}',
        {
          params: { path: { familyId, listId, itemId } },
          headers: { [HEADERS.ifMatch]: formatEtag(version) },
        },
      );
      ensureOk(result);
    },
    listMealPlan(familyId, from, to, houseId) {
      return collect((cursor) =>
        client
          .GET('/api/v1/families/{familyId}/meal-plan', {
            params: {
              path: { familyId },
              query: {
                from,
                to,
                limit: 200,
                ...(houseId === undefined ? {} : { houseId }),
                ...(cursor === undefined ? {} : { cursor }),
              },
            },
          })
          .then((result) => unwrap(mealPlanEntryPageSchema, result)),
      );
    },
    async createMealPlanEntry(familyId, idempotencyKey, body) {
      const result = await client.POST('/api/v1/families/{familyId}/meal-plan', {
        params: { path: { familyId } },
        body: body as components['schemas']['CreateMealPlanEntryRequestInput'],
        headers: { [HEADERS.idempotencyKey]: idempotencyKey },
      });
      return unwrap(mealPlanEntrySchema, result);
    },
    async updateMealPlanEntry(familyId, entryId, version, body) {
      const result = await client.PATCH('/api/v1/families/{familyId}/meal-plan/{entryId}', {
        params: { path: { familyId, entryId } },
        body: body as components['schemas']['UpdateMealPlanEntryRequestInput'],
        headers: { [HEADERS.ifMatch]: formatEtag(version) },
      });
      return unwrap(mealPlanEntrySchema, result);
    },
    async deleteMealPlanEntry(familyId, entryId, version) {
      const result = await client.DELETE('/api/v1/families/{familyId}/meal-plan/{entryId}', {
        params: { path: { familyId, entryId } },
        headers: { [HEADERS.ifMatch]: formatEtag(version) },
      });
      ensureOk(result);
    },
    listPantryItems(familyId, houseId) {
      return collect((cursor) =>
        client
          .GET('/api/v1/families/{familyId}/houses/{houseId}/pantry-items', {
            params: {
              path: { familyId, houseId },
              query: { limit: 200, ...(cursor === undefined ? {} : { cursor }) },
            },
          })
          .then((result) => unwrap(pantryItemPageSchema, result)),
      );
    },
    async createPantryItem(familyId, houseId, idempotencyKey, body) {
      const result = await client.POST('/api/v1/families/{familyId}/houses/{houseId}/pantry-items', {
        params: { path: { familyId, houseId } },
        body: body as components['schemas']['CreatePantryItemRequestInput'],
        headers: { [HEADERS.idempotencyKey]: idempotencyKey },
      });
      return unwrap(pantryItemSchema, result);
    },
    async updatePantryItem(familyId, houseId, itemId, version, body) {
      const result = await client.PATCH(
        '/api/v1/families/{familyId}/houses/{houseId}/pantry-items/{itemId}',
        {
          params: { path: { familyId, houseId, itemId } },
          body: body as components['schemas']['UpdatePantryItemRequestInput'],
          headers: { [HEADERS.ifMatch]: formatEtag(version) },
        },
      );
      return unwrap(pantryItemSchema, result);
    },
    async deletePantryItem(familyId, houseId, itemId, version) {
      const result = await client.DELETE(
        '/api/v1/families/{familyId}/houses/{houseId}/pantry-items/{itemId}',
        {
          params: { path: { familyId, houseId, itemId } },
          headers: { [HEADERS.ifMatch]: formatEtag(version) },
        },
      );
      ensureOk(result);
    },
    async getBarcodeProduct(familyId, code) {
      const result = await client.GET('/api/v1/families/{familyId}/barcode-products/{code}', {
        params: { path: { familyId, code } },
      });
      return unwrap(barcodeProductSchema, result);
    },
    async upsertBarcodeProduct(familyId, code, idempotencyKey, body) {
      const result = await client.PUT('/api/v1/families/{familyId}/barcode-products/{code}', {
        params: { path: { familyId, code } },
        body: body as components['schemas']['UpsertBarcodeProductRequestInput'],
        headers: { [HEADERS.idempotencyKey]: idempotencyKey },
      });
      return unwrap(barcodeProductSchema, result);
    },
    listFinanceAccounts(familyId) {
      return collect((cursor) =>
        client
          .GET('/api/v1/families/{familyId}/finance/accounts', {
            params: {
              path: { familyId },
              query: { limit: 200, ...(cursor === undefined ? {} : { cursor }) },
            },
          })
          .then((result) => unwrap(finAccountPageSchema, result)),
      );
    },
    async createFinanceAccount(familyId, idempotencyKey, body) {
      const result = await client.POST('/api/v1/families/{familyId}/finance/accounts', {
        params: { path: { familyId } },
        body: body as components['schemas']['CreateFinAccountRequestInput'],
        headers: { [HEADERS.idempotencyKey]: idempotencyKey },
      });
      return unwrap(finAccountSchema, result);
    },
    listFinanceTransactions(familyId) {
      return collect((cursor) =>
        client
          .GET('/api/v1/families/{familyId}/finance/transactions', {
            params: {
              path: { familyId },
              query: { limit: 200, ...(cursor === undefined ? {} : { cursor }) },
            },
          })
          .then((result) => unwrap(finTransactionPageSchema, result)),
      );
    },
    async createFinanceTransaction(familyId, idempotencyKey, body) {
      const result = await client.POST('/api/v1/families/{familyId}/finance/transactions', {
        params: { path: { familyId } },
        body: body as components['schemas']['CreateFinTransactionRequestInput'],
        headers: { [HEADERS.idempotencyKey]: idempotencyKey },
      });
      return unwrap(finTransactionSchema, result);
    },
    async putFinanceSplits(familyId, transactionId, idempotencyKey, body) {
      const result = await client.PUT(
        '/api/v1/families/{familyId}/finance/transactions/{transactionId}/splits',
        {
          params: { path: { familyId, transactionId } },
          body: body as components['schemas']['PutFinSplitsRequestInput'],
          headers: { [HEADERS.idempotencyKey]: idempotencyKey },
        },
      );
      return unwrap(finTransactionSchema, result);
    },
    listFinanceBudgets(familyId) {
      return collect((cursor) =>
        client
          .GET('/api/v1/families/{familyId}/finance/budgets', {
            params: {
              path: { familyId },
              query: { limit: 200, ...(cursor === undefined ? {} : { cursor }) },
            },
          })
          .then((result) => unwrap(finBudgetPageSchema, result)),
      );
    },
    async createFinanceBudget(familyId, idempotencyKey, body) {
      const result = await client.POST('/api/v1/families/{familyId}/finance/budgets', {
        params: { path: { familyId } },
        body: body as components['schemas']['CreateFinBudgetRequestInput'],
        headers: { [HEADERS.idempotencyKey]: idempotencyKey },
      });
      return unwrap(finBudgetSchema, result);
    },
    listFinanceSavingsGoals(familyId) {
      return collect((cursor) =>
        client
          .GET('/api/v1/families/{familyId}/finance/savings-goals', {
            params: {
              path: { familyId },
              query: { limit: 200, ...(cursor === undefined ? {} : { cursor }) },
            },
          })
          .then((result) => unwrap(finSavingsGoalPageSchema, result)),
      );
    },
    async createFinanceSavingsGoal(familyId, idempotencyKey, body) {
      const result = await client.POST('/api/v1/families/{familyId}/finance/savings-goals', {
        params: { path: { familyId } },
        body: body as components['schemas']['CreateFinSavingsGoalRequestInput'],
        headers: { [HEADERS.idempotencyKey]: idempotencyKey },
      });
      return unwrap(finSavingsGoalSchema, result);
    },
    listFinanceRecurring(familyId) {
      return collect((cursor) =>
        client
          .GET('/api/v1/families/{familyId}/finance/recurring', {
            params: {
              path: { familyId },
              query: { limit: 200, ...(cursor === undefined ? {} : { cursor }) },
            },
          })
          .then((result) => unwrap(finRecurringPageSchema, result)),
      );
    },
    async createFinanceRecurring(familyId, idempotencyKey, body) {
      const result = await client.POST('/api/v1/families/{familyId}/finance/recurring', {
        params: { path: { familyId } },
        body: body as components['schemas']['CreateFinRecurringRequestInput'],
        headers: { [HEADERS.idempotencyKey]: idempotencyKey },
      });
      return unwrap(finRecurringSchema, result);
    },
    async getFinanceReport(familyId, kind, from, to) {
      const result = await client.GET('/api/v1/families/{familyId}/finance/reports/{kind}', {
        params: { path: { familyId, kind }, query: { from, to } },
      });
      return unwrap(finReportSchema, result);
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
    listAutomationConnections(familyId, houseId) {
      return collect((cursor) =>
        client
          .GET('/api/v1/families/{familyId}/houses/{houseId}/automation/connections', {
            params: {
              path: { familyId, houseId },
              query: { limit: 200, ...(cursor === undefined ? {} : { cursor }) },
            },
          })
          .then((result) => unwrap(haConnectionPageSchema, result)),
      );
    },
    async createAutomationConnection(familyId, houseId, idempotencyKey, body) {
      const result = await client.POST(
        '/api/v1/families/{familyId}/houses/{houseId}/automation/connections',
        {
          params: { path: { familyId, houseId } },
          body: body as components['schemas']['CreateHaConnectionRequestInput'],
          headers: { [HEADERS.idempotencyKey]: idempotencyKey },
        },
      );
      return unwrap(createHaConnectionResponseSchema, result);
    },
    async testAutomationConnection(familyId, houseId, connectionId, idempotencyKey) {
      const result = await client.POST(
        '/api/v1/families/{familyId}/houses/{houseId}/automation/connections/{connectionId}/test',
        {
          params: { path: { familyId, houseId, connectionId } },
          headers: { [HEADERS.idempotencyKey]: idempotencyKey },
        },
      );
      return unwrap(haConnectionTestResultSchema, result);
    },
    async refreshAutomationDevices(familyId, houseId, connectionId, idempotencyKey) {
      const result = await client.POST(
        '/api/v1/families/{familyId}/houses/{houseId}/automation/connections/{connectionId}/refresh',
        {
          params: { path: { familyId, houseId, connectionId } },
          headers: { [HEADERS.idempotencyKey]: idempotencyKey },
        },
      );
      return unwrap(haRefreshResultSchema, result);
    },
    listAutomationDevices(familyId, houseId) {
      return collect((cursor) =>
        client
          .GET('/api/v1/families/{familyId}/houses/{houseId}/automation/devices', {
            params: {
              path: { familyId, houseId },
              query: { limit: 200, ...(cursor === undefined ? {} : { cursor }) },
            },
          })
          .then((result) => unwrap(haDevicePageSchema, result)),
      );
    },
    listAutomationZones(familyId, houseId) {
      return collect((cursor) =>
        client
          .GET('/api/v1/families/{familyId}/houses/{houseId}/automation/zones', {
            params: {
              path: { familyId, houseId },
              query: { limit: 200, ...(cursor === undefined ? {} : { cursor }) },
            },
          })
          .then((result) => unwrap(haZonePageSchema, result)),
      );
    },
    async createAutomationZone(familyId, houseId, idempotencyKey, body) {
      const result = await client.POST('/api/v1/families/{familyId}/houses/{houseId}/automation/zones', {
        params: { path: { familyId, houseId } },
        body: body as components['schemas']['CreateHaZoneRequestInput'],
        headers: { [HEADERS.idempotencyKey]: idempotencyKey },
      });
      return unwrap(haZoneSchema, result);
    },
    async updateAutomationZone(familyId, houseId, zoneId, version, body) {
      const result = await client.PATCH(
        '/api/v1/families/{familyId}/houses/{houseId}/automation/zones/{zoneId}',
        {
          params: { path: { familyId, houseId, zoneId } },
          body: body as components['schemas']['UpdateHaZoneRequestInput'],
          headers: { [HEADERS.ifMatch]: formatEtag(version) },
        },
      );
      return unwrap(haZoneSchema, result);
    },
    listAutomationLockCodes(familyId, houseId) {
      return collect((cursor) =>
        client
          .GET('/api/v1/families/{familyId}/houses/{houseId}/automation/lock-codes', {
            params: {
              path: { familyId, houseId },
              query: { limit: 200, ...(cursor === undefined ? {} : { cursor }) },
            },
          })
          .then((result) => unwrap(haLockCodePageSchema, result)),
      );
    },
    async issueAutomationLockCode(familyId, houseId, deviceId, idempotencyKey, body) {
      const result = await client.POST(
        '/api/v1/families/{familyId}/houses/{houseId}/automation/devices/{deviceId}/lock-codes',
        {
          params: { path: { familyId, houseId, deviceId } },
          body,
          headers: { [HEADERS.idempotencyKey]: idempotencyKey },
        },
      );
      return unwrap(issueHaLockCodeResponseSchema, result);
    },
    async getBranding(familyId) {
      const result = await client.GET('/api/v1/families/{familyId}/branding', {
        params: { path: { familyId } },
      });
      return (await unwrap(familyBrandingResponseSchema, result)).branding;
    },
    async putBranding(familyId, version, body, idempotencyKey) {
      const result = await client.PUT('/api/v1/families/{familyId}/branding', {
        params: { path: { familyId } },
        body,
        headers: {
          [HEADERS.idempotencyKey]: idempotencyKey,
          ...(version === null ? {} : { [HEADERS.ifMatch]: formatEtag(version) }),
        },
      });
      return (await unwrap(familyBrandingResponseSchema, result)).branding;
    },
    async listPublicationReadings(familyId, houseId) {
      const result = await client.GET('/api/v1/families/{familyId}/houses/{houseId}/publication-readings', {
        params: { path: { familyId, houseId } },
      });
      return (await unwrap(publicationReadingListSchema, result)).items;
    },
    async getPublicHousePage(token, deviceLabel) {
      const result = await client.GET('/api/v1/public/house-pages/{token}', {
        params: { path: { token } },
        headers: deviceHeaders(deviceLabel),
      });
      return unwrap(publicHousePageSchema, result);
    },
    async getPublicRescueSheet(token, deviceLabel) {
      const result = await client.GET('/api/v1/public/rescue-sheets/{token}', {
        params: { path: { token } },
        headers: deviceHeaders(deviceLabel),
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
    async listAuditEvents(familyId) {
      return collect(async (cursor) => {
        const result = await client.GET('/api/v1/families/{familyId}/audit-events', {
          params: { path: { familyId }, query: cursor === undefined ? {} : { cursor } },
        });
        return unwrap(auditEventListSchema, result);
      });
    },
    async listRevisions(familyId, resourceType, resourceId) {
      return collect(async (cursor) => {
        const result = await client.GET('/api/v1/families/{familyId}/revisions', {
          params: {
            path: { familyId },
            query: {
              resourceType,
              resourceId,
              ...(cursor === undefined ? {} : { cursor }),
            },
          },
        });
        return unwrap(revisionListSchema, result);
      });
    },
    async restoreRevision(familyId, revisionId, body, idempotencyKey) {
      const result = await client.POST('/api/v1/families/{familyId}/revisions/{revisionId}/restore', {
        params: { path: { familyId, revisionId } },
        body: body as components['schemas']['RestoreRevisionRequest'],
        headers: { [HEADERS.idempotencyKey]: idempotencyKey },
      });
      return unwrap(revisionSchema, result);
    },
  };
}
