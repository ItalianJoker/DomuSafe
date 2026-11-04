import {
  families,
  houses,
  maintenanceTasks,
  residents,
  successionItems,
  taxChecklistItems,
  vehicles,
  type Transaction,
} from '@domusafe/db';
import { and, desc, eq, inArray, isNotNull, isNull, lt, or, type SQL } from 'drizzle-orm';

/** How many dated rows one source may contribute. Older rows beyond this are left out. */
const SOURCE_LIMIT = 500;

/** An open maintenance task with a due date still ahead of its last completion. */
export interface OpenMaintenance {
  readonly id: string;
  readonly houseId: string;
  readonly title: string;
  readonly dueDate: string;
  readonly version: number;
}

/** A vehicle row that has at least one stored date. */
export interface VehicleDates {
  readonly id: string;
  readonly plate: string;
  readonly insuranceRenewalDate: string | null;
  readonly roadTaxDueDate: string | null;
  readonly inspectionDueDate: string | null;
}

/** A tax checklist row that still has a date and is not finished. */
export interface OpenTaxDate {
  readonly id: string;
  readonly itemKey: (typeof taxChecklistItems.$inferSelect)['itemKey'];
  readonly taxYear: number;
  readonly dueDate: string;
}

/** A succession activity whose reminder might be a date. */
export interface SuccessionHint {
  readonly id: string;
  readonly kind: (typeof successionItems.$inferSelect)['kind'];
  readonly title: string | null;
  readonly deadlineNote: string | null;
}

/**
 * Reads the family time zone.
 *
 * Preconditions: the transaction has the family context.
 * Postconditions: a family the caller cannot see is null.
 * Data contract: the value is the stored IANA time zone.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @returns The time zone, or null.
 */
export async function familyTimeZone(tx: Transaction, familyId: string): Promise<string | null> {
  const [row] = await tx
    .select({ timezone: families.timezone })
    .from(families)
    .where(and(eq(families.id, familyId), isNull(families.deletedAt)));
  return row?.timezone ?? null;
}

/**
 * Reads a house the caller can see.
 *
 * Preconditions: the transaction has the family context.
 * Postconditions: a trashed or hidden house is null.
 * Data contract: only the id is returned.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @returns The house id, or null.
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
 * Lists open maintenance deadlines of one house.
 *
 * Preconditions: the transaction has the family context.
 * Postconditions: a task whose last completion is on or after the due date is omitted.
 * Data contract: at most {@link SOURCE_LIMIT} rows, newest due dates first.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @returns Open tasks.
 */
export async function listOpenMaintenance(
  tx: Transaction,
  familyId: string,
  houseId: string,
): Promise<OpenMaintenance[]> {
  const rows = await tx
    .select({
      id: maintenanceTasks.id,
      houseId: maintenanceTasks.houseId,
      title: maintenanceTasks.title,
      dueDate: maintenanceTasks.nextDueDate,
      version: maintenanceTasks.version,
    })
    .from(maintenanceTasks)
    .where(
      and(
        eq(maintenanceTasks.familyId, familyId),
        eq(maintenanceTasks.houseId, houseId),
        isNull(maintenanceTasks.deletedAt),
        eq(maintenanceTasks.active, true),
        isNotNull(maintenanceTasks.nextDueDate),
        or(
          isNull(maintenanceTasks.lastDoneOn),
          lt(maintenanceTasks.lastDoneOn, maintenanceTasks.nextDueDate),
        ),
      ),
    )
    .orderBy(desc(maintenanceTasks.nextDueDate))
    .limit(SOURCE_LIMIT);
  return rows.flatMap((row) => (row.dueDate === null ? [] : [{ ...row, dueDate: row.dueDate }]));
}

/**
 * Lists vehicles that store at least one date.
 *
 * Preconditions: the transaction has the family context. Row-level security hides other people.
 * Postconditions: a vehicle with no dates is omitted.
 * Data contract: at most {@link SOURCE_LIMIT} rows.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @returns Vehicles and their dates.
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
    .orderBy(desc(vehicles.updatedAt))
    .limit(SOURCE_LIMIT);
}

/**
 * Lists tax checklist rows that still have a date.
 *
 * Preconditions: the caller may read taxes and the plan includes them. The transaction has the family context.
 * Postconditions: finished and not-applicable rows are omitted. An owner filter keeps only that account's people.
 * Data contract: at most {@link SOURCE_LIMIT} rows.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param ownerAccountId - When set, only people linked to this account.
 * @returns Open tax dates.
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
    .orderBy(desc(taxChecklistItems.dueDate))
    .limit(SOURCE_LIMIT);
  return rows.flatMap((row) => (row.dueDate === null ? [] : [{ ...row, dueDate: row.dueDate }]));
}

/**
 * Lists succession activities that are still open and carry a reminder.
 *
 * Preconditions: the transaction has the family context. Row-level security hides the checklist from
 * roles that cannot read it.
 * Postconditions: done and deleted activities are omitted. The reminder may still be ordinary text.
 * Data contract: at most {@link SOURCE_LIMIT} rows.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @returns Open reminders.
 */
export async function listSuccessionHints(tx: Transaction, familyId: string): Promise<SuccessionHint[]> {
  return tx
    .select({
      id: successionItems.id,
      kind: successionItems.kind,
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
    .orderBy(desc(successionItems.updatedAt))
    .limit(SOURCE_LIMIT);
}
