import { queryOptions } from '@tanstack/react-query';
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
