import {
  calendarEvents,
  contacts,
  houseGuideEntries,
  houseShutoffs,
  houses,
  inventoryItems,
  maintenanceTasks,
  pets,
  phoneLines,
  residents,
  rooms,
  storageUnits,
  subscriptions,
  timetableSlots,
  utilities,
  vaultItems,
  vehicles,
  wasteCollections,
  type Transaction,
} from '@domusafe/db';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';

/** Page keyset: creation time ISO string and id. */
export interface ExportPage {
  readonly limit: number;
  readonly after: readonly [string, string] | null;
}

/**
 * Lists non-deleted residents of a family for export.
 *
 * @param tx - Transaction with family context.
 * @param familyId - Family id.
 * @param page - Limit and optional cursor.
 * @returns Up to `limit + 1` rows.
 */
export async function listResidents(tx: Transaction, familyId: string, page: ExportPage) {
  const after =
    page.after === null
      ? undefined
      : sql`(${residents.createdAt}, ${residents.id}) > (${page.after[0]}::timestamptz, ${page.after[1]})`;
  return tx
    .select()
    .from(residents)
    .where(and(eq(residents.familyId, familyId), isNull(residents.deletedAt), after))
    .orderBy(asc(residents.createdAt), asc(residents.id))
    .limit(page.limit + 1);
}

/**
 * Lists pets of a family for export.
 *
 * @param tx - Transaction with family context.
 * @param familyId - Family id.
 * @param page - Limit and optional cursor.
 * @returns Up to `limit + 1` rows.
 */
export async function listPets(tx: Transaction, familyId: string, page: ExportPage) {
  const after =
    page.after === null
      ? undefined
      : sql`(${pets.createdAt}, ${pets.id}) > (${page.after[0]}::timestamptz, ${page.after[1]})`;
  return tx
    .select()
    .from(pets)
    .where(and(eq(pets.familyId, familyId), isNull(pets.deletedAt), after))
    .orderBy(asc(pets.createdAt), asc(pets.id))
    .limit(page.limit + 1);
}

/**
 * Lists shared contacts for export.
 *
 * @param tx - Transaction with family context.
 * @param familyId - Family id.
 * @param page - Limit and optional cursor.
 * @returns Up to `limit + 1` rows.
 */
export async function listContacts(tx: Transaction, familyId: string, page: ExportPage) {
  const after =
    page.after === null
      ? undefined
      : sql`(${contacts.createdAt}, ${contacts.id}) > (${page.after[0]}::timestamptz, ${page.after[1]})`;
  return tx
    .select()
    .from(contacts)
    .where(and(eq(contacts.familyId, familyId), isNull(contacts.deletedAt), after))
    .orderBy(asc(contacts.createdAt), asc(contacts.id))
    .limit(page.limit + 1);
}

/**
 * Lists utility contracts; payment envelopes stay sealed.
 *
 * @param tx - Transaction with family context.
 * @param familyId - Family id.
 * @param page - Limit and optional cursor.
 * @returns Up to `limit + 1` rows.
 */
export async function listUtilities(tx: Transaction, familyId: string, page: ExportPage) {
  const after =
    page.after === null
      ? undefined
      : sql`(${utilities.createdAt}, ${utilities.id}) > (${page.after[0]}::timestamptz, ${page.after[1]})`;
  return tx
    .select()
    .from(utilities)
    .where(and(eq(utilities.familyId, familyId), isNull(utilities.deletedAt), after))
    .orderBy(asc(utilities.createdAt), asc(utilities.id))
    .limit(page.limit + 1);
}

/**
 * Lists rooms for inventory export.
 *
 * @param tx - Transaction with family context.
 * @param familyId - Family id.
 * @param page - Limit and optional cursor.
 * @returns Up to `limit + 1` rows.
 */
export async function listRooms(tx: Transaction, familyId: string, page: ExportPage) {
  const after =
    page.after === null
      ? undefined
      : sql`(${rooms.createdAt}, ${rooms.id}) > (${page.after[0]}::timestamptz, ${page.after[1]})`;
  return tx
    .select()
    .from(rooms)
    .where(and(eq(rooms.familyId, familyId), isNull(rooms.deletedAt), after))
    .orderBy(asc(rooms.createdAt), asc(rooms.id))
    .limit(page.limit + 1);
}

/**
 * Lists storage units for inventory export.
 *
 * @param tx - Transaction with family context.
 * @param familyId - Family id.
 * @param page - Limit and optional cursor.
 * @returns Up to `limit + 1` rows.
 */
export async function listStorageUnits(tx: Transaction, familyId: string, page: ExportPage) {
  const after =
    page.after === null
      ? undefined
      : sql`(${storageUnits.createdAt}, ${storageUnits.id}) > (${page.after[0]}::timestamptz, ${page.after[1]})`;
  return tx
    .select()
    .from(storageUnits)
    .where(and(eq(storageUnits.familyId, familyId), isNull(storageUnits.deletedAt), after))
    .orderBy(asc(storageUnits.createdAt), asc(storageUnits.id))
    .limit(page.limit + 1);
}

/**
 * Lists inventory items for export.
 *
 * @param tx - Transaction with family context.
 * @param familyId - Family id.
 * @param page - Limit and optional cursor.
 * @returns Up to `limit + 1` rows.
 */
export async function listInventoryItems(tx: Transaction, familyId: string, page: ExportPage) {
  const after =
    page.after === null
      ? undefined
      : sql`(${inventoryItems.createdAt}, ${inventoryItems.id}) > (${page.after[0]}::timestamptz, ${page.after[1]})`;
  return tx
    .select()
    .from(inventoryItems)
    .where(and(eq(inventoryItems.familyId, familyId), isNull(inventoryItems.deletedAt), after))
    .orderBy(asc(inventoryItems.createdAt), asc(inventoryItems.id))
    .limit(page.limit + 1);
}

/**
 * Lists houses for export.
 *
 * @param tx - Transaction with family context.
 * @param familyId - Family id.
 * @param page - Limit and optional cursor.
 * @returns Up to `limit + 1` rows.
 */
export async function listHouses(tx: Transaction, familyId: string, page: ExportPage) {
  const after =
    page.after === null
      ? undefined
      : sql`(${houses.createdAt}, ${houses.id}) > (${page.after[0]}::timestamptz, ${page.after[1]})`;
  return tx
    .select()
    .from(houses)
    .where(and(eq(houses.familyId, familyId), isNull(houses.deletedAt), after))
    .orderBy(asc(houses.createdAt), asc(houses.id))
    .limit(page.limit + 1);
}

/**
 * Lists house guide entries for export.
 *
 * @param tx - Transaction with family context.
 * @param familyId - Family id.
 * @param page - Limit and optional cursor.
 * @returns Up to `limit + 1` rows.
 */
export async function listGuideEntries(tx: Transaction, familyId: string, page: ExportPage) {
  const after =
    page.after === null
      ? undefined
      : sql`(${houseGuideEntries.createdAt}, ${houseGuideEntries.id}) > (${page.after[0]}::timestamptz, ${page.after[1]})`;
  return tx
    .select()
    .from(houseGuideEntries)
    .where(and(eq(houseGuideEntries.familyId, familyId), isNull(houseGuideEntries.deletedAt), after))
    .orderBy(asc(houseGuideEntries.createdAt), asc(houseGuideEntries.id))
    .limit(page.limit + 1);
}

/**
 * Lists shutoffs for export.
 *
 * @param tx - Transaction with family context.
 * @param familyId - Family id.
 * @param page - Limit and optional cursor.
 * @returns Up to `limit + 1` rows.
 */
export async function listShutoffs(tx: Transaction, familyId: string, page: ExportPage) {
  const after =
    page.after === null
      ? undefined
      : sql`(${houseShutoffs.createdAt}, ${houseShutoffs.id}) > (${page.after[0]}::timestamptz, ${page.after[1]})`;
  return tx
    .select()
    .from(houseShutoffs)
    .where(and(eq(houseShutoffs.familyId, familyId), isNull(houseShutoffs.deletedAt), after))
    .orderBy(asc(houseShutoffs.createdAt), asc(houseShutoffs.id))
    .limit(page.limit + 1);
}

/**
 * Lists waste collections for export.
 *
 * @param tx - Transaction with family context.
 * @param familyId - Family id.
 * @param page - Limit and optional cursor.
 * @returns Up to `limit + 1` rows.
 */
export async function listWaste(tx: Transaction, familyId: string, page: ExportPage) {
  const after =
    page.after === null
      ? undefined
      : sql`(${wasteCollections.createdAt}, ${wasteCollections.id}) > (${page.after[0]}::timestamptz, ${page.after[1]})`;
  return tx
    .select()
    .from(wasteCollections)
    .where(and(eq(wasteCollections.familyId, familyId), after))
    .orderBy(asc(wasteCollections.createdAt), asc(wasteCollections.id))
    .limit(page.limit + 1);
}

/**
 * Lists maintenance tasks (deadline sources) for export.
 *
 * @param tx - Transaction with family context.
 * @param familyId - Family id.
 * @param page - Limit and optional cursor.
 * @returns Up to `limit + 1` rows.
 */
export async function listMaintenance(tx: Transaction, familyId: string, page: ExportPage) {
  const after =
    page.after === null
      ? undefined
      : sql`(${maintenanceTasks.createdAt}, ${maintenanceTasks.id}) > (${page.after[0]}::timestamptz, ${page.after[1]})`;
  return tx
    .select()
    .from(maintenanceTasks)
    .where(and(eq(maintenanceTasks.familyId, familyId), isNull(maintenanceTasks.deletedAt), after))
    .orderBy(asc(maintenanceTasks.createdAt), asc(maintenanceTasks.id))
    .limit(page.limit + 1);
}

/**
 * Lists vault items; envelopes stay sealed as stored.
 *
 * @param tx - Transaction with family context.
 * @param familyId - Family id.
 * @param page - Limit and optional cursor.
 * @returns Up to `limit + 1` rows.
 */
export async function listVaultItems(tx: Transaction, familyId: string, page: ExportPage) {
  const after =
    page.after === null
      ? undefined
      : sql`(${vaultItems.createdAt}, ${vaultItems.id}) > (${page.after[0]}::timestamptz, ${page.after[1]})`;
  return tx
    .select()
    .from(vaultItems)
    .where(and(eq(vaultItems.familyId, familyId), isNull(vaultItems.deletedAt), after))
    .orderBy(asc(vaultItems.createdAt), asc(vaultItems.id))
    .limit(page.limit + 1);
}

/**
 * Lists phone lines for export.
 *
 * @param tx - Transaction with family context.
 * @param familyId - Family id.
 * @param page - Limit and optional cursor.
 * @returns Up to `limit + 1` rows.
 */
export async function listPhoneLines(tx: Transaction, familyId: string, page: ExportPage) {
  const after =
    page.after === null
      ? undefined
      : sql`(${phoneLines.createdAt}, ${phoneLines.id}) > (${page.after[0]}::timestamptz, ${page.after[1]})`;
  return tx
    .select()
    .from(phoneLines)
    .where(and(eq(phoneLines.familyId, familyId), isNull(phoneLines.deletedAt), after))
    .orderBy(asc(phoneLines.createdAt), asc(phoneLines.id))
    .limit(page.limit + 1);
}

/**
 * Lists personal subscriptions for export.
 *
 * @param tx - Transaction with family context.
 * @param familyId - Family id.
 * @param page - Limit and optional cursor.
 * @returns Up to `limit + 1` rows.
 */
export async function listSubscriptions(tx: Transaction, familyId: string, page: ExportPage) {
  const after =
    page.after === null
      ? undefined
      : sql`(${subscriptions.createdAt}, ${subscriptions.id}) > (${page.after[0]}::timestamptz, ${page.after[1]})`;
  return tx
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.familyId, familyId), isNull(subscriptions.deletedAt), after))
    .orderBy(asc(subscriptions.createdAt), asc(subscriptions.id))
    .limit(page.limit + 1);
}

/**
 * Lists vehicles and their deadline dates for export.
 *
 * @param tx - Transaction with family context.
 * @param familyId - Family id.
 * @param page - Limit and optional cursor.
 * @returns Up to `limit + 1` rows.
 */
export async function listVehicles(tx: Transaction, familyId: string, page: ExportPage) {
  const after =
    page.after === null
      ? undefined
      : sql`(${vehicles.createdAt}, ${vehicles.id}) > (${page.after[0]}::timestamptz, ${page.after[1]})`;
  return tx
    .select()
    .from(vehicles)
    .where(and(eq(vehicles.familyId, familyId), isNull(vehicles.deletedAt), after))
    .orderBy(asc(vehicles.createdAt), asc(vehicles.id))
    .limit(page.limit + 1);
}

/**
 * Lists calendar events for export.
 *
 * @param tx - Transaction with family context.
 * @param familyId - Family id.
 * @param page - Limit and optional cursor.
 * @returns Up to `limit + 1` rows.
 */
export async function listCalendarEvents(tx: Transaction, familyId: string, page: ExportPage) {
  const after =
    page.after === null
      ? undefined
      : sql`(${calendarEvents.createdAt}, ${calendarEvents.id}) > (${page.after[0]}::timestamptz, ${page.after[1]})`;
  return tx
    .select()
    .from(calendarEvents)
    .where(and(eq(calendarEvents.familyId, familyId), isNull(calendarEvents.deletedAt), after))
    .orderBy(asc(calendarEvents.createdAt), asc(calendarEvents.id))
    .limit(page.limit + 1);
}

/**
 * Lists weekly timetable slots for export.
 *
 * @param tx - Transaction with family context.
 * @param familyId - Family id.
 * @param page - Limit and optional cursor.
 * @returns Up to `limit + 1` rows.
 */
export async function listTimetableSlots(tx: Transaction, familyId: string, page: ExportPage) {
  const after =
    page.after === null
      ? undefined
      : sql`(${timetableSlots.createdAt}, ${timetableSlots.id}) > (${page.after[0]}::timestamptz, ${page.after[1]})`;
  return tx
    .select()
    .from(timetableSlots)
    .where(and(eq(timetableSlots.familyId, familyId), isNull(timetableSlots.deletedAt), after))
    .orderBy(asc(timetableSlots.createdAt), asc(timetableSlots.id))
    .limit(page.limit + 1);
}
