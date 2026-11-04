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
 * Query of the heating tasks used for the boiler-check deadline.
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
