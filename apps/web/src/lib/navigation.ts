/**
 * Sections of the product menu, in the order every screen must show them.
 *
 * A later module adds one entry here and one child route of `/f/$familyId/c/$houseId`.
 * It does not invent a second menu.
 */
export const SECTIONS = [
  { id: 'cassaforte', message: 'navCassaforte' },
  { id: 'famiglia', message: 'navFamiglia' },
  { id: 'casa', message: 'navCasa' },
  { id: 'personale', message: 'navPersonale' },
  { id: 'stampa', message: 'navStampa' },
  { id: 'extra', message: 'navExtra' },
  { id: 'guida', message: 'navGuida' },
  { id: 'account', message: 'navAccount' },
] as const;

/** Identifier of a primary section. */
export type SectionId = (typeof SECTIONS)[number]['id'];

/** A section, or the dashboard that opens under the house path. */
export type PlaceSection = SectionId | 'home';

/**
 * Routes of the shell menu, dashboard first, then {@link SECTIONS}.
 * Adding a module means one row here and one child of the house route.
 */
export const NAV_LINKS = [
  { id: 'home', to: '/f/$familyId/c/$houseId' },
  { id: 'cassaforte', to: '/f/$familyId/c/$houseId/cassaforte' },
  { id: 'famiglia', to: '/f/$familyId/c/$houseId/famiglia' },
  { id: 'casa', to: '/f/$familyId/c/$houseId/casa' },
  { id: 'personale', to: '/f/$familyId/c/$houseId/personale' },
  { id: 'stampa', to: '/f/$familyId/c/$houseId/stampa' },
  { id: 'extra', to: '/f/$familyId/c/$houseId/extra' },
  { id: 'guida', to: '/f/$familyId/c/$houseId/guida' },
  { id: 'account', to: '/f/$familyId/c/$houseId/account' },
] as const;

/**
 * Whether a path segment is a primary section.
 *
 * @param value - A single URL segment.
 * @returns The section id when it matches the menu.
 */
export function isSectionId(value: string): value is SectionId {
  return SECTIONS.some((section) => section.id === value);
}

/**
 * Reads the open section from a pathname.
 *
 * Preconditions: house paths look like `/f/{familyId}/c/{houseId}` plus an optional section.
 * Postconditions: unknown tails are treated as the dashboard.
 * Data contract: the result is a {@link PlaceSection}.
 *
 * @param pathname - Current pathname, with or without a trailing slash.
 * @returns The section to keep when the house changes.
 */
export function sectionFromPath(pathname: string): PlaceSection {
  const parts = pathname.split('/').filter((part) => part.length > 0);
  const section = parts[4];
  if (section !== undefined && isSectionId(section)) {
    return section;
  }
  return 'home';
}

/**
 * Builds the path of a section inside a house.
 *
 * @param familyId - Family id.
 * @param houseId - House id.
 * @param section - Dashboard or a primary section.
 * @returns An absolute path.
 */
export function shellPath(familyId: string, houseId: string, section: PlaceSection): string {
  const base = `/f/${familyId}/c/${houseId}`;
  return section === 'home' ? base : `${base}/${section}`;
}
