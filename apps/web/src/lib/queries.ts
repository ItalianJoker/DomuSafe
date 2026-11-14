import { queryOptions } from '@tanstack/react-query';
import type { InventoryFilterNode } from '@domusafe/contracts';
import type { DomusafeApi } from './api.js';

/** Cache key of the current account. */
export const meKey = ['me'] as const;

/**
 * Query of `GET /me`.
 *
 * @param api - Shell API.
 * @returns Options for TanStack Query. Null means signed out.
 */
export function meQuery(api: DomusafeApi) {
  return queryOptions({
    queryKey: meKey,
    queryFn: () => api.getMe(),
  });
}

/**
 * Query of the houses visible in a family.
 *
 * @param api - Shell API.
 * @param familyId - Family id.
 * @returns Options for TanStack Query.
 */
export function housesQuery(api: DomusafeApi, familyId: string) {
  return queryOptions({
    queryKey: ['houses', familyId] as const,
    queryFn: () => api.listHouses(familyId),
  });
}

/**
 * Query of one family.
 *
 * @param api - Shell API.
 * @param familyId - Family id.
 * @returns Options for TanStack Query.
 */
export function familyQuery(api: DomusafeApi, familyId: string) {
  return queryOptions({
    queryKey: ['family', familyId] as const,
    queryFn: () => api.getFamily(familyId),
  });
}

/**
 * Query of the people in a family.
 *
 * @param api - Shell API.
 * @param familyId - Family id.
 * @returns Options for TanStack Query.
 */
export function membersQuery(api: DomusafeApi, familyId: string) {
  return queryOptions({
    queryKey: ['members', familyId] as const,
    queryFn: () => api.listMembers(familyId),
  });
}

/**
 * Query of the guest projection for one house.
 *
 * @param api - Shell API.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @returns Options for TanStack Query.
 */
export function guestViewQuery(api: DomusafeApi, familyId: string, houseId: string) {
  return queryOptions({
    queryKey: ['guest-view', familyId, houseId] as const,
    queryFn: () => api.getGuestView(familyId, houseId),
  });
}

/**
 * Query of the guest preview used by people who edit the house.
 *
 * @param api - Shell API.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @returns Options for TanStack Query.
 */
export function guestPreviewQuery(api: DomusafeApi, familyId: string, houseId: string) {
  return queryOptions({
    queryKey: ['guest-preview', familyId, houseId] as const,
    queryFn: () => api.previewGuestView(familyId, houseId),
  });
}

/**
 * Query of the cutoff locations.
 *
 * @param api - Shell API.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @returns Options for TanStack Query.
 */
export function shutoffsQuery(api: DomusafeApi, familyId: string, houseId: string) {
  return queryOptions({
    queryKey: ['shutoffs', familyId, houseId] as const,
    queryFn: () => api.listShutoffs(familyId, houseId),
  });
}

/**
 * Query of the artisans linked to one house.
 *
 * @param api - Shell API.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @returns Options for TanStack Query.
 */
export function artisansQuery(api: DomusafeApi, familyId: string, houseId: string) {
  return queryOptions({
    queryKey: ['artisans', familyId, houseId] as const,
    queryFn: () => api.listContacts(familyId, { kind: 'craftsman', houseId }),
  });
}

/**
 * Query of the utility contracts.
 *
 * @param api - Shell API.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @returns Options for TanStack Query.
 */
export function utilitiesQuery(api: DomusafeApi, familyId: string, houseId: string) {
  return queryOptions({
    queryKey: ['utilities', familyId, houseId] as const,
    queryFn: () => api.listUtilities(familyId, houseId),
  });
}

/**
 * Query of the people linked to one house.
 *
 * @param api - Shell API.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @returns Options for TanStack Query.
 */
export function residentsQuery(api: DomusafeApi, familyId: string, houseId: string) {
  return queryOptions({
    queryKey: ['residents', familyId, houseId] as const,
    queryFn: () => api.listResidents(familyId, houseId),
  });
}

/**
 * Query of one rescue card.
 *
 * @param api - Shell API.
 * @param familyId - Family id.
 * @param residentId - Person id.
 * @returns Options for TanStack Query.
 */
export function rescueQuery(api: DomusafeApi, familyId: string, residentId: string) {
  return queryOptions({
    queryKey: ['rescue', familyId, residentId] as const,
    queryFn: () => api.getRescue(familyId, residentId),
  });
}

/**
 * Query of the «Chi sono» sheet.
 *
 * @param api - Shell API.
 * @param familyId - Family id.
 * @param residentId - Person id.
 * @returns Options for TanStack Query.
 */
export function aboutQuery(api: DomusafeApi, familyId: string, residentId: string) {
  return queryOptions({
    queryKey: ['about', familyId, residentId] as const,
    queryFn: () => api.getAbout(familyId, residentId),
  });
}

/**
 * Query of the vital parameters diary.
 *
 * @param api - Shell API.
 * @param familyId - Family id.
 * @param residentId - Person id.
 * @returns Options for TanStack Query.
 */
export function vitalsQuery(api: DomusafeApi, familyId: string, residentId: string) {
  return queryOptions({
    queryKey: ['vitals', familyId, residentId] as const,
    queryFn: () => api.listVitals(familyId, residentId),
  });
}

/**
 * Query of caregiver handovers for one house.
 *
 * @param api - Shell API.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @returns Options for TanStack Query.
 */
export function handoversQuery(api: DomusafeApi, familyId: string, houseId: string) {
  return queryOptions({
    queryKey: ['handovers', familyId, houseId] as const,
    queryFn: () => api.listHandovers(familyId, houseId),
  });
}

/**
 * Query of the caller's personal relationship notebook.
 *
 * @param api - Shell API.
 * @param familyId - Family id.
 * @returns Options for TanStack Query.
 */
export function relationshipsQuery(api: DomusafeApi, familyId: string) {
  return queryOptions({
    queryKey: ['relationships', familyId] as const,
    queryFn: () => api.listRelationships(familyId),
  });
}

/**
 * Query of active chores for one house.
 *
 * @param api - Shell API.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @returns Options for TanStack Query.
 */
export function choresQuery(api: DomusafeApi, familyId: string, houseId: string) {
  return queryOptions({
    queryKey: ['chores', familyId, houseId] as const,
    queryFn: () => api.listChores(familyId, houseId),
  });
}

/**
 * Query of chore completions, optionally filtered by status.
 *
 * @param api - Shell API.
 * @param familyId - Family id.
 * @param status - Optional status filter.
 * @returns Options for TanStack Query.
 */
export function choreCompletionsQuery(
  api: DomusafeApi,
  familyId: string,
  status?: 'pending_approval' | 'approved' | 'rejected',
) {
  return queryOptions({
    queryKey: ['chore-completions', familyId, status ?? 'all'] as const,
    queryFn: () => api.listChoreCompletions(familyId, status),
  });
}

/**
 * Query of point balance and streak for one resident.
 *
 * @param api - Shell API.
 * @param familyId - Family id.
 * @param residentId - Resident id.
 * @returns Options for TanStack Query.
 */
export function pointsQuery(api: DomusafeApi, familyId: string, residentId: string) {
  return queryOptions({
    queryKey: ['points', familyId, residentId] as const,
    queryFn: () => api.getPoints(familyId, residentId),
  });
}

/**
 * Query of the family rewards store.
 *
 * @param api - Shell API.
 * @param familyId - Family id.
 * @returns Options for TanStack Query.
 */
export function rewardsQuery(api: DomusafeApi, familyId: string) {
  return queryOptions({
    queryKey: ['rewards-store', familyId] as const,
    queryFn: () => api.listRewards(familyId),
  });
}

/**
 * Query of the family recipe library.
 *
 * @param api - Shell API.
 * @param familyId - Family id.
 * @returns Options for TanStack Query.
 */
export function recipesQuery(api: DomusafeApi, familyId: string) {
  return queryOptions({
    queryKey: ['recipes', familyId] as const,
    queryFn: () => api.listRecipes(familyId),
  });
}

/**
 * Query of family stores used by shopping lists.
 *
 * @param api - Shell API.
 * @param familyId - Family id.
 * @returns Options for TanStack Query.
 */
export function storesQuery(api: DomusafeApi, familyId: string) {
  return queryOptions({
    queryKey: ['stores', familyId] as const,
    queryFn: () => api.listStores(familyId),
  });
}

/**
 * Query of shopping lists for one house.
 *
 * @param api - Shell API.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @returns Options for TanStack Query.
 */
export function shoppingListsQuery(api: DomusafeApi, familyId: string, houseId: string) {
  return queryOptions({
    queryKey: ['shopping-lists', familyId, houseId] as const,
    queryFn: () => api.listShoppingLists(familyId, houseId),
  });
}

/**
 * Query of items on one shopping list.
 *
 * @param api - Shell API.
 * @param familyId - Family id.
 * @param listId - List id.
 * @returns Options for TanStack Query.
 */
export function shoppingItemsQuery(api: DomusafeApi, familyId: string, listId: string) {
  return queryOptions({
    queryKey: ['shopping-items', familyId, listId] as const,
    queryFn: () => api.listShoppingItems(familyId, listId),
  });
}

/**
 * Query of pantry stock for one house.
 *
 * @param api - Shell API.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @returns Options for TanStack Query.
 */
export function pantryItemsQuery(api: DomusafeApi, familyId: string, houseId: string) {
  return queryOptions({
    queryKey: ['pantry-items', familyId, houseId] as const,
    queryFn: () => api.listPantryItems(familyId, houseId),
  });
}

/**
 * Query of meal plan entries for a date range.
 *
 * @param api - Shell API.
 * @param familyId - Family id.
 * @param from - Inclusive start date.
 * @param to - Inclusive end date.
 * @param houseId - Optional house filter.
 * @returns Options for TanStack Query.
 */
export function mealPlanQuery(
  api: DomusafeApi,
  familyId: string,
  from: string,
  to: string,
  houseId?: string,
) {
  return queryOptions({
    queryKey: ['meal-plan', familyId, from, to, houseId ?? null] as const,
    queryFn: () => api.listMealPlan(familyId, from, to, houseId),
  });
}

/**
 * Query of the printed codes of one house.
 *
 * @param api - Shell API.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @returns Options for TanStack Query.
 */
export function publicationsQuery(api: DomusafeApi, familyId: string, houseId: string) {
  return queryOptions({
    queryKey: ['publications', familyId, houseId] as const,
    queryFn: () => api.listPublications(familyId, houseId),
  });
}

/**
 * Query of the reading log of one house, newest first.
 *
 * Preconditions: the caller can edit the house and the plan includes the log.
 * Postconditions: the query is not started by this helper; the screen decides.
 * Data contract: each item is the time, the code kind and the device label.
 *
 * @param api - Shell API.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @returns Options for TanStack Query.
 */
export function publicationReadingsQuery(api: DomusafeApi, familyId: string, houseId: string) {
  return queryOptions({
    queryKey: ['publication-readings', familyId, houseId] as const,
    queryFn: () => api.listPublicationReadings(familyId, houseId),
  });
}

/**
 * Query of the readable rescue sheet of one house.
 *
 * @param api - Shell API.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @returns Options for TanStack Query.
 */
export function rescueSheetQuery(api: DomusafeApi, familyId: string, houseId: string) {
  return queryOptions({
    queryKey: ['rescue-sheet', familyId, houseId] as const,
    queryFn: () => api.getRescueSheet(familyId, houseId),
  });
}

/**
 * Query of the animals of one house.
 *
 * @param api - Shell API.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @returns Options for TanStack Query.
 */
export function petsQuery(api: DomusafeApi, familyId: string, houseId: string) {
  return queryOptions({
    queryKey: ['pets', familyId, houseId] as const,
    queryFn: () => api.listPets(familyId, houseId),
  });
}

/**
 * Query of the mobile plans of a person.
 *
 * @param api - Shell API.
 * @param familyId - Family id.
 * @param residentId - Person id.
 * @returns Options for TanStack Query.
 */
export function phoneLinesQuery(api: DomusafeApi, familyId: string, residentId: string) {
  return queryOptions({
    queryKey: ['phone-lines', familyId, residentId] as const,
    queryFn: () => api.listPhoneLines(familyId, residentId),
  });
}

/**
 * Query of the personal subscriptions of a person.
 *
 * @param api - Shell API.
 * @param familyId - Family id.
 * @param residentId - Person id.
 * @returns Options for TanStack Query.
 */
export function subscriptionsQuery(api: DomusafeApi, familyId: string, residentId: string) {
  return queryOptions({
    queryKey: ['subscriptions', familyId, residentId] as const,
    queryFn: () => api.listSubscriptions(familyId, residentId),
  });
}

/**
 * Query of the vehicles of a person.
 *
 * @param api - Shell API.
 * @param familyId - Family id.
 * @param residentId - Person id.
 * @returns Options for TanStack Query.
 */
export function vehiclesQuery(api: DomusafeApi, familyId: string, residentId: string) {
  return queryOptions({
    queryKey: ['vehicles', familyId, residentId] as const,
    queryFn: () => api.listVehicles(familyId, residentId),
  });
}

/**
 * Query of personal bank-account metadata.
 *
 * @param api - Shell API.
 * @param familyId - Family id.
 * @param residentId - Person id.
 * @returns Options for TanStack Query.
 */
export function bankAccountsQuery(api: DomusafeApi, familyId: string, residentId: string) {
  return queryOptions({
    queryKey: ['bank-accounts', familyId, residentId] as const,
    queryFn: () => api.listBankAccounts(familyId, residentId),
  });
}

/**
 * Query of the tax checklist of one year.
 *
 * @param api - Shell API.
 * @param familyId - Family id.
 * @param residentId - Person id.
 * @param year - Calendar year.
 * @returns Options for TanStack Query.
 */
export function taxQuery(api: DomusafeApi, familyId: string, residentId: string, year: number) {
  return queryOptions({
    queryKey: ['tax', familyId, residentId, year] as const,
    queryFn: () => api.listTax(familyId, residentId, year),
  });
}

/**
 * Query of the family host mark.
 *
 * Preconditions: the plan includes branding; otherwise the query stays disabled.
 * Postconditions: null means the family has not saved a mark.
 * Data contract: name, color, welcome sentence and logo address.
 *
 * @param api - Shell API.
 * @param familyId - Family id.
 * @returns Options for TanStack Query.
 */
export function brandingQuery(api: DomusafeApi, familyId: string) {
  return queryOptions({
    queryKey: ['branding', familyId] as const,
    queryFn: () => api.getBranding(familyId),
  });
}

/**
 * Query of the family succession checklist.
 *
 * @param api - Shell API.
 * @param familyId - Family id.
 * @returns Options for TanStack Query.
 */
export function successionQuery(api: DomusafeApi, familyId: string) {
  return queryOptions({
    queryKey: ['succession', familyId] as const,
    queryFn: () => api.listSuccession(familyId),
  });
}

/**
 * Query of the overview deadlines for the open house.
 *
 * @param api - Shell API.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @returns Options for TanStack Query.
 */
export function deadlinesQuery(api: DomusafeApi, familyId: string, houseId: string) {
  return queryOptions({
    queryKey: ['deadlines', familyId, houseId] as const,
    queryFn: () => api.listDeadlines(familyId, houseId),
  });
}

/** Cache key of the in-app notification inbox. */
export const notificationsKey = ['notifications'] as const;

/**
 * Query of recent in-app notifications for the signed-in account.
 *
 * @param api - Shell API.
 * @param limit - Page size (default 30).
 * @returns Options for TanStack Query.
 */
export function notificationsQuery(api: DomusafeApi, limit = 30) {
  return queryOptions({
    queryKey: notificationsKey,
    queryFn: () => api.listNotifications({ limit, unreadOnly: false }),
    refetchInterval: 60_000,
  });
}

/**
 * Query of the family calendar board for a date range.
 *
 * @param api - Shell API.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @param from - Inclusive start date.
 * @param to - Inclusive end date.
 * @returns Options for TanStack Query.
 */
export function calendarBoardQuery(
  api: DomusafeApi,
  familyId: string,
  houseId: string,
  from: string,
  to: string,
) {
  return queryOptions({
    queryKey: ['calendar-board', familyId, houseId, from, to] as const,
    queryFn: () => api.getCalendarBoard(familyId, houseId, from, to),
  });
}

/**
 * Query of heating maintenance, used for the boiler deadline.
 *
 * @param api - Shell API.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @returns Options for TanStack Query.
 */
export function boilerQuery(api: DomusafeApi, familyId: string, houseId: string) {
  return queryOptions({
    queryKey: ['boiler', familyId, houseId] as const,
    queryFn: () => api.listMaintenance(familyId, houseId, 'heating'),
  });
}

/**
 * Query of the rooms of one house.
 *
 * @param api - Shell API.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @returns Options for TanStack Query.
 */
export function roomsQuery(api: DomusafeApi, familyId: string, houseId: string) {
  return queryOptions({
    queryKey: ['rooms', familyId, houseId] as const,
    queryFn: () => api.listRooms(familyId, houseId),
  });
}

/**
 * Query of closets and containers of one house.
 *
 * @param api - Shell API.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @returns Options for TanStack Query.
 */
export function storageUnitsQuery(api: DomusafeApi, familyId: string, houseId: string) {
  return queryOptions({
    queryKey: ['storage-units', familyId, houseId] as const,
    queryFn: () => api.listStorageUnits(familyId, houseId),
  });
}

/**
 * Query of inventory items of one house.
 *
 * @param api - Shell API.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @returns Options for TanStack Query.
 */
export function inventoryItemsQuery(api: DomusafeApi, familyId: string, houseId: string) {
  return queryOptions({
    queryKey: ['inventory-items', familyId, houseId] as const,
    queryFn: () => api.listInventoryItems(familyId, houseId),
  });
}

/**
 * Full-text search over the house inventory.
 *
 * @param api - Shell API.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @param query - Search text.
 * @returns Options for TanStack Query.
 */
export function inventorySearchQuery(api: DomusafeApi, familyId: string, houseId: string, query: string) {
  return queryOptions({
    queryKey: ['inventory-search', familyId, houseId, query] as const,
    queryFn: () => api.searchInventory(familyId, houseId, query),
  });
}

/**
 * Nested AND/OR filter search over the house inventory.
 *
 * @param api - Shell API.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @param filter - Nested filter tree, or null when inactive.
 * @returns Options for TanStack Query.
 */
export function inventoryFilterSearchQuery(
  api: DomusafeApi,
  familyId: string,
  houseId: string,
  filter: InventoryFilterNode | null,
) {
  return queryOptions({
    queryKey: ['inventory-filter-search', familyId, houseId, filter] as const,
    queryFn: () => {
      if (filter === null) {
        return Promise.resolve({ items: [] });
      }
      return api.searchInventoryFiltered(familyId, houseId, { filter, limit: 20 });
    },
  });
}

/**
 * Saved inventory filters of the signed-in member.
 *
 * @param api - Shell API.
 * @param familyId - Family id.
 * @returns Options for TanStack Query.
 */
export function savedFiltersQuery(api: DomusafeApi, familyId: string) {
  return queryOptions({
    queryKey: ['saved-filters', familyId] as const,
    queryFn: () => api.listSavedFilters(familyId),
  });
}

/**
 * Query of family ledger accounts.
 *
 * @param api - Shell API.
 * @param familyId - Family id.
 * @returns Options for TanStack Query.
 */
export function financeAccountsQuery(api: DomusafeApi, familyId: string) {
  return queryOptions({
    queryKey: ['finance-accounts', familyId] as const,
    queryFn: () => api.listFinanceAccounts(familyId),
  });
}

/**
 * Query of finance transactions.
 *
 * @param api - Shell API.
 * @param familyId - Family id.
 * @returns Options for TanStack Query.
 */
export function financeTransactionsQuery(api: DomusafeApi, familyId: string) {
  return queryOptions({
    queryKey: ['finance-transactions', familyId] as const,
    queryFn: () => api.listFinanceTransactions(familyId),
  });
}

/**
 * Query of finance budgets.
 *
 * @param api - Shell API.
 * @param familyId - Family id.
 * @returns Options for TanStack Query.
 */
export function financeBudgetsQuery(api: DomusafeApi, familyId: string) {
  return queryOptions({
    queryKey: ['finance-budgets', familyId] as const,
    queryFn: () => api.listFinanceBudgets(familyId),
  });
}

/**
 * Query of savings goals.
 *
 * @param api - Shell API.
 * @param familyId - Family id.
 * @returns Options for TanStack Query.
 */
export function financeSavingsGoalsQuery(api: DomusafeApi, familyId: string) {
  return queryOptions({
    queryKey: ['finance-savings-goals', familyId] as const,
    queryFn: () => api.listFinanceSavingsGoals(familyId),
  });
}

/**
 * Query of recurring finance templates.
 *
 * @param api - Shell API.
 * @param familyId - Family id.
 * @returns Options for TanStack Query.
 */
export function financeRecurringQuery(api: DomusafeApi, familyId: string) {
  return queryOptions({
    queryKey: ['finance-recurring', familyId] as const,
    queryFn: () => api.listFinanceRecurring(familyId),
  });
}

/**
 * Query of the family audit history.
 *
 * @param api - Shell API.
 * @param familyId - Family id.
 * @returns Options for TanStack Query.
 */
export function auditEventsQuery(api: DomusafeApi, familyId: string) {
  return queryOptions({
    queryKey: ['audit-events', familyId] as const,
    queryFn: () => api.listAuditEvents(familyId),
  });
}

/**
 * Query of revisions for one resource.
 *
 * @param api - Shell API.
 * @param familyId - Family id.
 * @param resourceType - Resource table name.
 * @param resourceId - Resource id.
 * @returns Options for TanStack Query.
 */
export function revisionsQuery(api: DomusafeApi, familyId: string, resourceType: string, resourceId: string) {
  return queryOptions({
    queryKey: ['revisions', familyId, resourceType, resourceId] as const,
    queryFn: () => api.listRevisions(familyId, resourceType, resourceId),
  });
}

/**
 * Query of home-automation connections for a house.
 *
 * @param api - Shell API.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @returns Options for TanStack Query.
 */
export function automationConnectionsQuery(api: DomusafeApi, familyId: string, houseId: string) {
  return queryOptions({
    queryKey: ['automation-connections', familyId, houseId] as const,
    queryFn: () => api.listAutomationConnections(familyId, houseId),
  });
}

/**
 * Query of home-automation devices for a house.
 *
 * @param api - Shell API.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @returns Options for TanStack Query.
 */
export function automationDevicesQuery(api: DomusafeApi, familyId: string, houseId: string) {
  return queryOptions({
    queryKey: ['automation-devices', familyId, houseId] as const,
    queryFn: () => api.listAutomationDevices(familyId, houseId),
  });
}

/**
 * Query of zone alarms for a house.
 *
 * @param api - Shell API.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @returns Options for TanStack Query.
 */
export function automationZonesQuery(api: DomusafeApi, familyId: string, houseId: string) {
  return queryOptions({
    queryKey: ['automation-zones', familyId, houseId] as const,
    queryFn: () => api.listAutomationZones(familyId, houseId),
  });
}

/**
 * Query of temporary smart-lock codes for a house.
 *
 * @param api - Shell API.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @returns Options for TanStack Query.
 */
export function automationLockCodesQuery(api: DomusafeApi, familyId: string, houseId: string) {
  return queryOptions({
    queryKey: ['automation-lock-codes', familyId, houseId] as const,
    queryFn: () => api.listAutomationLockCodes(familyId, houseId),
  });
}
