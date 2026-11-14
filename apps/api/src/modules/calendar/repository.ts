import {
  calendarEventResidents,
  calendarEvents,
  chores,
  families,
  houses,
  maintenanceTasks,
  residents,
  successionItems,
  taxChecklistItems,
  timetableSlots,
  vehicles,
  type Transaction,
} from '@domusafe/db';
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, or, sql, type SQL } from 'drizzle-orm';

/** Row of `calendar_events`. */
export type CalendarEventRow = typeof calendarEvents.$inferSelect;
/** Row of `timetable_slots`. */
export type TimetableSlotRow = typeof timetableSlots.$inferSelect;

interface Page {
  readonly limit: number;
  readonly after: readonly [string, string] | null;
}

/**
 * Reads the family time zone and display name.
 *
 * @param tx - Transaction with family context.
 * @param familyId - Family id.
 * @returns The row, or null.
 */
export async function familyMeta(
  tx: Transaction,
  familyId: string,
): Promise<{ timezone: string; name: string } | null> {
  const [row] = await tx
    .select({ timezone: families.timezone, name: families.name })
    .from(families)
    .where(and(eq(families.id, familyId), isNull(families.deletedAt)));
  return row ?? null;
}

/**
 * Confirms a house exists in the family.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @returns The id, or null.
 */
export async function findHouse(
  tx: Transaction,
  familyId: string,
  houseId: string,
): Promise<{ id: string } | null> {
  const [row] = await tx
    .select({ id: houses.id })
    .from(houses)
    .where(and(eq(houses.familyId, familyId), eq(houses.id, houseId), isNull(houses.deletedAt)));
  return row ?? null;
}

/**
 * Confirms a resident exists in the family.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param residentId - Resident id.
 * @returns The id, or null.
 */
export async function findResident(
  tx: Transaction,
  familyId: string,
  residentId: string,
): Promise<{ id: string } | null> {
  const [row] = await tx
    .select({ id: residents.id })
    .from(residents)
    .where(and(eq(residents.familyId, familyId), eq(residents.id, residentId), isNull(residents.deletedAt)));
  return row ?? null;
}

/**
 * Inserts a calendar event.
 *
 * @param tx - Transaction.
 * @param input - Columns.
 * @returns The inserted row.
 */
export async function insertEvent(
  tx: Transaction,
  input: {
    readonly familyId: string;
    readonly houseId: string | null;
    readonly visibility: 'family' | 'personal';
    readonly ownerAccountId: string | null;
    readonly title: string;
    readonly description: string | null;
    readonly location: string | null;
    readonly startsAt: Date;
    readonly endsAt: Date;
    readonly allDay: boolean;
    readonly timezone: string;
    readonly rrule: string | null;
    readonly exdates: readonly string[];
    readonly category: CalendarEventRow['category'];
    readonly createdBy: string;
  },
): Promise<CalendarEventRow> {
  const [row] = await tx
    .insert(calendarEvents)
    .values({
      familyId: input.familyId,
      houseId: input.houseId,
      visibility: input.visibility,
      ownerAccountId: input.ownerAccountId,
      title: input.title,
      description: input.description,
      location: input.location,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      allDay: input.allDay,
      timezone: input.timezone,
      rrule: input.rrule,
      exdates: [...input.exdates],
      category: input.category,
      source: 'internal',
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    })
    .returning();
  if (row === undefined) {
    throw new Error('Calendar event insert returned no row');
  }
  return row;
}

/**
 * Replaces the residents linked to an event.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param eventId - Event id.
 * @param residentIds - Residents to keep.
 */
export async function replaceEventResidents(
  tx: Transaction,
  familyId: string,
  eventId: string,
  residentIds: readonly string[],
): Promise<void> {
  await tx
    .delete(calendarEventResidents)
    .where(and(eq(calendarEventResidents.familyId, familyId), eq(calendarEventResidents.eventId, eventId)));
  if (residentIds.length === 0) {
    return;
  }
  await tx.insert(calendarEventResidents).values(
    residentIds.map((residentId) => ({
      familyId,
      eventId,
      residentId,
    })),
  );
}

/**
 * Lists resident ids linked to an event.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param eventId - Event id.
 * @returns Resident ids.
 */
export async function listEventResidentIds(
  tx: Transaction,
  familyId: string,
  eventId: string,
): Promise<string[]> {
  const rows = await tx
    .select({ residentId: calendarEventResidents.residentId })
    .from(calendarEventResidents)
    .where(and(eq(calendarEventResidents.familyId, familyId), eq(calendarEventResidents.eventId, eventId)));
  return rows.map((row) => row.residentId);
}

/**
 * Loads one active calendar event.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param eventId - Event id.
 * @returns The row, or null.
 */
export async function getEvent(
  tx: Transaction,
  familyId: string,
  eventId: string,
): Promise<CalendarEventRow | null> {
  const [row] = await tx
    .select()
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.familyId, familyId),
        eq(calendarEvents.id, eventId),
        isNull(calendarEvents.deletedAt),
      ),
    );
  return row ?? null;
}

/**
 * Lists calendar events that overlap a time window, newest start first.
 *
 * @param tx - Transaction.
 * @param input - Family, window and page.
 * @returns Rows (may include one extra for the cursor).
 */
export async function listEvents(
  tx: Transaction,
  input: {
    readonly familyId: string;
    readonly fromInstant: Date;
    readonly toInstant: Date;
    readonly houseId?: string | undefined;
    readonly limit: number;
    readonly after: readonly [string, string] | null;
  },
): Promise<CalendarEventRow[]> {
  const filters: SQL[] = [
    eq(calendarEvents.familyId, input.familyId),
    isNull(calendarEvents.deletedAt),
    lte(calendarEvents.startsAt, input.toInstant),
    gte(calendarEvents.endsAt, input.fromInstant),
  ];
  if (input.houseId !== undefined) {
    const houseFilter = or(isNull(calendarEvents.houseId), eq(calendarEvents.houseId, input.houseId));
    if (houseFilter !== undefined) {
      filters.push(houseFilter);
    }
  }
  if (input.after !== null) {
    const [startsAt, id] = input.after;
    filters.push(
      sql`(${calendarEvents.startsAt}, ${calendarEvents.id}) < (${new Date(startsAt)}, ${id}::uuid)`,
    );
  }
  return tx
    .select()
    .from(calendarEvents)
    .where(and(...filters))
    .orderBy(desc(calendarEvents.startsAt), desc(calendarEvents.id))
    .limit(input.limit + 1);
}

/**
 * Lists every active event that can contribute occurrences in a window.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param fromInstant - Window start.
 * @param toInstant - Window end.
 * @param houseId - Open house; events of other houses are excluded unless house is null.
 * @returns Matching rows.
 */
export async function listEventsForBoard(
  tx: Transaction,
  familyId: string,
  fromInstant: Date,
  toInstant: Date,
  houseId: string,
): Promise<CalendarEventRow[]> {
  return tx
    .select()
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.familyId, familyId),
        isNull(calendarEvents.deletedAt),
        or(isNull(calendarEvents.houseId), eq(calendarEvents.houseId, houseId)),
        or(
          and(
            isNull(calendarEvents.rrule),
            lte(calendarEvents.startsAt, toInstant),
            gte(calendarEvents.endsAt, fromInstant),
          ),
          and(isNotNull(calendarEvents.rrule), lte(calendarEvents.startsAt, toInstant)),
        ),
      ),
    )
    .orderBy(asc(calendarEvents.startsAt), asc(calendarEvents.id))
    .limit(2_000);
}

/**
 * Updates a versioned calendar event.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param eventId - Event id.
 * @param expectedVersion - Version the client loaded.
 * @param patch - Columns to set.
 * @returns The updated row, or null on version mismatch.
 */
export async function updateEvent(
  tx: Transaction,
  familyId: string,
  eventId: string,
  expectedVersion: number,
  patch: {
    readonly title?: string | undefined;
    readonly description?: string | null | undefined;
    readonly location?: string | null | undefined;
    readonly startsAt?: Date | undefined;
    readonly endsAt?: Date | undefined;
    readonly allDay?: boolean | undefined;
    readonly timezone?: string | undefined;
    readonly rrule?: string | null | undefined;
    readonly exdates?: readonly string[] | undefined;
    readonly category?: CalendarEventRow['category'] | undefined;
    readonly houseId?: string | null | undefined;
    readonly visibility?: 'family' | 'personal' | undefined;
    readonly ownerAccountId?: string | null | undefined;
    readonly updatedBy: string;
  },
): Promise<CalendarEventRow | null> {
  const [row] = await tx
    .update(calendarEvents)
    .set({
      ...(patch.title === undefined ? {} : { title: patch.title }),
      ...(patch.description === undefined ? {} : { description: patch.description }),
      ...(patch.location === undefined ? {} : { location: patch.location }),
      ...(patch.startsAt === undefined ? {} : { startsAt: patch.startsAt }),
      ...(patch.endsAt === undefined ? {} : { endsAt: patch.endsAt }),
      ...(patch.allDay === undefined ? {} : { allDay: patch.allDay }),
      ...(patch.timezone === undefined ? {} : { timezone: patch.timezone }),
      ...(patch.rrule === undefined ? {} : { rrule: patch.rrule }),
      ...(patch.exdates === undefined ? {} : { exdates: [...patch.exdates] }),
      ...(patch.category === undefined ? {} : { category: patch.category }),
      ...(patch.houseId === undefined ? {} : { houseId: patch.houseId }),
      ...(patch.visibility === undefined ? {} : { visibility: patch.visibility }),
      ...(patch.ownerAccountId === undefined ? {} : { ownerAccountId: patch.ownerAccountId }),
      updatedBy: patch.updatedBy,
      version: sql`${calendarEvents.version} + 1`,
    })
    .where(
      and(
        eq(calendarEvents.familyId, familyId),
        eq(calendarEvents.id, eventId),
        eq(calendarEvents.version, expectedVersion),
        isNull(calendarEvents.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Soft-deletes a calendar event.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param eventId - Event id.
 * @param expectedVersion - Version the client loaded.
 * @param updatedBy - Account id.
 * @returns The updated row, or null on version mismatch.
 */
export async function softDeleteEvent(
  tx: Transaction,
  familyId: string,
  eventId: string,
  expectedVersion: number,
  updatedBy: string,
): Promise<CalendarEventRow | null> {
  const [row] = await tx
    .update(calendarEvents)
    .set({
      deletedAt: new Date(),
      updatedBy,
      version: sql`${calendarEvents.version} + 1`,
    })
    .where(
      and(
        eq(calendarEvents.familyId, familyId),
        eq(calendarEvents.id, eventId),
        eq(calendarEvents.version, expectedVersion),
        isNull(calendarEvents.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Inserts a timetable slot.
 *
 * @param tx - Transaction.
 * @param input - Columns.
 * @returns The inserted row.
 */
export async function insertTimetableSlot(
  tx: Transaction,
  input: {
    readonly familyId: string;
    readonly residentId: string;
    readonly weekday: number;
    readonly startsAt: string;
    readonly endsAt: string;
    readonly title: string;
    readonly location: string | null;
    readonly validFrom: string | null;
    readonly validTo: string | null;
    readonly createdBy: string;
  },
): Promise<TimetableSlotRow> {
  const [row] = await tx
    .insert(timetableSlots)
    .values({
      familyId: input.familyId,
      residentId: input.residentId,
      weekday: input.weekday,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      title: input.title,
      location: input.location,
      validFrom: input.validFrom,
      validTo: input.validTo,
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    })
    .returning();
  if (row === undefined) {
    throw new Error('Timetable slot insert returned no row');
  }
  return row;
}

/**
 * Loads one active timetable slot.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param slotId - Slot id.
 * @returns The row, or null.
 */
export async function getTimetableSlot(
  tx: Transaction,
  familyId: string,
  slotId: string,
): Promise<TimetableSlotRow | null> {
  const [row] = await tx
    .select()
    .from(timetableSlots)
    .where(
      and(
        eq(timetableSlots.familyId, familyId),
        eq(timetableSlots.id, slotId),
        isNull(timetableSlots.deletedAt),
      ),
    );
  return row ?? null;
}

/**
 * Lists timetable slots, newest first.
 *
 * @param tx - Transaction.
 * @param input - Family, optional resident filter and page.
 * @returns Rows.
 */
export async function listTimetableSlots(
  tx: Transaction,
  input: {
    readonly familyId: string;
    readonly residentId?: string | undefined;
    readonly limit: number;
    readonly after: readonly [string, string] | null;
  },
): Promise<TimetableSlotRow[]> {
  const filters: SQL[] = [eq(timetableSlots.familyId, input.familyId), isNull(timetableSlots.deletedAt)];
  if (input.residentId !== undefined) {
    filters.push(eq(timetableSlots.residentId, input.residentId));
  }
  if (input.after !== null) {
    const [createdAt, id] = input.after;
    filters.push(
      sql`(${timetableSlots.createdAt}, ${timetableSlots.id}) < (${new Date(createdAt)}, ${id}::uuid)`,
    );
  }
  return tx
    .select()
    .from(timetableSlots)
    .where(and(...filters))
    .orderBy(desc(timetableSlots.createdAt), desc(timetableSlots.id))
    .limit(input.limit + 1);
}

/**
 * Lists every active timetable slot for board expansion.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @returns Slots.
 */
export async function listTimetableSlotsForBoard(
  tx: Transaction,
  familyId: string,
): Promise<TimetableSlotRow[]> {
  return tx
    .select()
    .from(timetableSlots)
    .where(and(eq(timetableSlots.familyId, familyId), isNull(timetableSlots.deletedAt)))
    .orderBy(asc(timetableSlots.weekday), asc(timetableSlots.startsAt))
    .limit(2_000);
}

/**
 * Updates a versioned timetable slot.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param slotId - Slot id.
 * @param expectedVersion - Version the client loaded.
 * @param patch - Columns to set.
 * @returns The updated row, or null on version mismatch.
 */
export async function updateTimetableSlot(
  tx: Transaction,
  familyId: string,
  slotId: string,
  expectedVersion: number,
  patch: {
    readonly weekday?: number | undefined;
    readonly startsAt?: string | undefined;
    readonly endsAt?: string | undefined;
    readonly title?: string | undefined;
    readonly location?: string | null | undefined;
    readonly validFrom?: string | null | undefined;
    readonly validTo?: string | null | undefined;
    readonly updatedBy: string;
  },
): Promise<TimetableSlotRow | null> {
  const [row] = await tx
    .update(timetableSlots)
    .set({
      ...(patch.weekday === undefined ? {} : { weekday: patch.weekday }),
      ...(patch.startsAt === undefined ? {} : { startsAt: patch.startsAt }),
      ...(patch.endsAt === undefined ? {} : { endsAt: patch.endsAt }),
      ...(patch.title === undefined ? {} : { title: patch.title }),
      ...(patch.location === undefined ? {} : { location: patch.location }),
      ...(patch.validFrom === undefined ? {} : { validFrom: patch.validFrom }),
      ...(patch.validTo === undefined ? {} : { validTo: patch.validTo }),
      updatedBy: patch.updatedBy,
      version: sql`${timetableSlots.version} + 1`,
    })
    .where(
      and(
        eq(timetableSlots.familyId, familyId),
        eq(timetableSlots.id, slotId),
        eq(timetableSlots.version, expectedVersion),
        isNull(timetableSlots.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Soft-deletes a timetable slot.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param slotId - Slot id.
 * @param expectedVersion - Version the client loaded.
 * @param updatedBy - Account id.
 * @returns The updated row, or null on version mismatch.
 */
export async function softDeleteTimetableSlot(
  tx: Transaction,
  familyId: string,
  slotId: string,
  expectedVersion: number,
  updatedBy: string,
): Promise<TimetableSlotRow | null> {
  const [row] = await tx
    .update(timetableSlots)
    .set({
      deletedAt: new Date(),
      updatedBy,
      version: sql`${timetableSlots.version} + 1`,
    })
    .where(
      and(
        eq(timetableSlots.familyId, familyId),
        eq(timetableSlots.id, slotId),
        eq(timetableSlots.version, expectedVersion),
        isNull(timetableSlots.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

/** Open maintenance task with a due date. */
export interface OpenMaintenance {
  readonly id: string;
  readonly houseId: string;
  readonly title: string;
  readonly dueDate: string;
}

/**
 * Lists open maintenance tasks of one house that fall in a date range.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @param from - Inclusive start date.
 * @param to - Inclusive end date.
 * @returns Tasks.
 */
export async function listMaintenanceInRange(
  tx: Transaction,
  familyId: string,
  houseId: string,
  from: string,
  to: string,
): Promise<OpenMaintenance[]> {
  const rows = await tx
    .select({
      id: maintenanceTasks.id,
      houseId: maintenanceTasks.houseId,
      title: maintenanceTasks.title,
      dueDate: maintenanceTasks.nextDueDate,
    })
    .from(maintenanceTasks)
    .where(
      and(
        eq(maintenanceTasks.familyId, familyId),
        eq(maintenanceTasks.houseId, houseId),
        isNull(maintenanceTasks.deletedAt),
        eq(maintenanceTasks.active, true),
        isNotNull(maintenanceTasks.nextDueDate),
        gte(maintenanceTasks.nextDueDate, from),
        lte(maintenanceTasks.nextDueDate, to),
        or(
          isNull(maintenanceTasks.lastDoneOn),
          lt(maintenanceTasks.lastDoneOn, maintenanceTasks.nextDueDate),
        ),
      ),
    )
    .limit(500);
  return rows.flatMap((row) =>
    row.dueDate === null
      ? []
      : [{ id: row.id, houseId: row.houseId, title: row.title, dueDate: row.dueDate }],
  );
}

/** Vehicle dates that may appear on the calendar. */
export interface VehicleDates {
  readonly id: string;
  readonly plate: string;
  readonly insuranceRenewalDate: string | null;
  readonly roadTaxDueDate: string | null;
  readonly inspectionDueDate: string | null;
}

/**
 * Lists vehicles that have at least one stored date.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @returns Vehicles.
 */
export async function listVehicleDates(tx: Transaction, familyId: string): Promise<VehicleDates[]> {
  return tx
    .select({
      id: vehicles.id,
      plate: vehicles.plate,
      insuranceRenewalDate: vehicles.insuranceRenewalDate,
      roadTaxDueDate: vehicles.roadTaxDueDate,
      inspectionDueDate: vehicles.inspectionDueDate,
    })
    .from(vehicles)
    .where(
      and(
        eq(vehicles.familyId, familyId),
        isNull(vehicles.deletedAt),
        or(
          isNotNull(vehicles.insuranceRenewalDate),
          isNotNull(vehicles.roadTaxDueDate),
          isNotNull(vehicles.inspectionDueDate),
        ),
      ),
    )
    .limit(500);
}

/** Open tax checklist row with a due date. */
export interface OpenTaxDate {
  readonly id: string;
  readonly itemKey: (typeof taxChecklistItems.$inferSelect)['itemKey'];
  readonly taxYear: number;
  readonly dueDate: string;
}

/**
 * Lists unfinished tax checklist dates.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param ownerAccountId - When set, only that account's people.
 * @returns Tax rows.
 */
export async function listOpenTaxDates(
  tx: Transaction,
  familyId: string,
  ownerAccountId: string | null,
): Promise<OpenTaxDate[]> {
  const owner: SQL | undefined =
    ownerAccountId === null ? undefined : eq(residents.accountId, ownerAccountId);
  const rows = await tx
    .select({
      id: taxChecklistItems.id,
      itemKey: taxChecklistItems.itemKey,
      taxYear: taxChecklistItems.taxYear,
      dueDate: taxChecklistItems.dueDate,
    })
    .from(taxChecklistItems)
    .innerJoin(
      residents,
      and(eq(residents.familyId, taxChecklistItems.familyId), eq(residents.id, taxChecklistItems.residentId)),
    )
    .where(
      and(
        eq(taxChecklistItems.familyId, familyId),
        isNull(residents.deletedAt),
        isNotNull(taxChecklistItems.dueDate),
        inArray(taxChecklistItems.status, ['todo', 'in_progress']),
        owner,
      ),
    )
    .limit(500);
  return rows.flatMap((row) => (row.dueDate === null ? [] : [{ ...row, dueDate: row.dueDate }]));
}

/** Succession activity whose reminder might be a date. */
export interface SuccessionHint {
  readonly id: string;
  readonly title: string | null;
  readonly deadlineNote: string | null;
}

/**
 * Lists succession reminders that might be calendar dates.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @returns Hints.
 */
export async function listSuccessionHints(tx: Transaction, familyId: string): Promise<SuccessionHint[]> {
  return tx
    .select({
      id: successionItems.id,
      title: successionItems.title,
      deadlineNote: successionItems.deadlineNote,
    })
    .from(successionItems)
    .where(
      and(
        eq(successionItems.familyId, familyId),
        isNull(successionItems.deletedAt),
        eq(successionItems.done, false),
        isNotNull(successionItems.deadlineNote),
      ),
    )
    .limit(500);
}

/** Active chore with a next due date. */
export interface DueChore {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly nextDueDate: string;
  readonly houseId: string | null;
  readonly assignedResidentIds: readonly string[];
}

/**
 * Lists active chores whose next due date falls in a range.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param houseId - Open house.
 * @param from - Inclusive start.
 * @param to - Inclusive end.
 * @returns Chores.
 */
export async function listChoresInRange(
  tx: Transaction,
  familyId: string,
  houseId: string,
  from: string,
  to: string,
): Promise<DueChore[]> {
  const rows = await tx
    .select({
      id: chores.id,
      title: chores.title,
      description: chores.description,
      nextDueDate: chores.nextDueDate,
      houseId: chores.houseId,
      assignedResidentIds: chores.assignedResidentIds,
    })
    .from(chores)
    .where(
      and(
        eq(chores.familyId, familyId),
        isNull(chores.deletedAt),
        eq(chores.active, true),
        isNotNull(chores.nextDueDate),
        gte(chores.nextDueDate, from),
        lte(chores.nextDueDate, to),
        or(isNull(chores.houseId), eq(chores.houseId, houseId)),
      ),
    )
    .limit(500);
  return rows
    .filter((row): row is typeof row & { nextDueDate: string } => row.nextDueDate !== null)
    .map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      nextDueDate: row.nextDueDate,
      houseId: row.houseId,
      assignedResidentIds: row.assignedResidentIds,
    }));
}

export type { Page };
