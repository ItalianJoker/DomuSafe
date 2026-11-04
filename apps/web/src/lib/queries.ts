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
