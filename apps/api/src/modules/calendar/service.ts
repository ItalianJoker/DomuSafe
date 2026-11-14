import {
  buildIcsCalendar,
  calendarDateInTimeZone,
  decide,
  encodeCursor,
  shiftCalendarDate,
  successionCalendarDate,
  type CalendarBoard,
  type CalendarEvent,
  type CalendarExport,
  type CalendarOccurrence,
  type CreateCalendarEventRequest,
  type CreateTimetableSlotRequest,
  type TimetableSlot,
  type UpdateCalendarEventRequest,
  type UpdateTimetableSlotRequest,
} from '@domusafe/contracts';
import { recordAudit, recordRevision, withContext, type Database, type Transaction } from '@domusafe/db';
import { hasFeature } from '@domusafe/plans';
import { ProblemError, classifyDatabaseError } from '../../http/problem.js';
import type { TenantContext } from '../../types.js';
import * as repo from './repository.js';

/** One page of a list. */
export interface Page<T> {
  readonly items: T[];
  readonly nextCursor: string | null;
}

function rethrowDatabaseError(error: unknown): never {
  if (error instanceof ProblemError) {
    throw error;
  }
  const failure = classifyDatabaseError(error);
  switch (failure.kind) {
    case 'rls_denied':
      throw new ProblemError('forbidden');
    case 'unique':
      throw new ProblemError('duplicate');
    case 'foreign_key':
      throw new ProblemError('validation_failed', {
        detail: 'A referenced item does not exist in this family',
      });
    case 'check':
      throw new ProblemError('domain_rule_violated', {
        detail: `Constraint ${failure.constraint ?? 'check'} violated`,
      });
    case 'other':
      throw error;
  }
}

async function guarded<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    rethrowDatabaseError(error);
  }
}

function conflict(currentVersion: number): never {
  throw new ProblemError('version_conflict', { currentVersion });
}

function pageOfCreated<TRow extends { createdAt: Date; id: string }, TView>(
  rows: TRow[],
  limit: number,
  view: (row: TRow) => TView,
): Page<TView> {
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  const last = slice.at(-1);
  return {
    items: slice.map(view),
    nextCursor: hasMore && last !== undefined ? encodeCursor([last.createdAt.toISOString(), last.id]) : null,
  };
}

function pageOfStarts<TRow extends { startsAt: Date; id: string }, TView>(
  rows: TRow[],
  limit: number,
  view: (row: TRow) => TView | Promise<TView>,
): Promise<Page<TView>> {
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  return Promise.all(slice.map((row) => view(row))).then((items) => {
    const last = slice.at(-1);
    return {
      items,
      nextCursor: hasMore && last !== undefined ? encodeCursor([last.startsAt.toISOString(), last.id]) : null,
    };
  });
}

function clockFromInstant(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const hour = parts.find((part) => part.type === 'hour')?.value ?? '00';
  const minute = parts.find((part) => part.type === 'minute')?.value ?? '00';
  return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
}

function isoWeekday(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  const utc = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
  const sundayBased = utc.getUTCDay();
  return sundayBased === 0 ? 7 : sundayBased;
}

function addMonths(iso: string, months: number): string {
  const [year, month, day] = iso.split('-').map((part) => Number(part));
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1 + months, day ?? 1));
  return date.toISOString().slice(0, 10);
}

function addYears(iso: string, years: number): string {
  return addMonths(iso, years * 12);
}

function nextSimpleOccurrence(dueDate: string, rrule: string): string | null {
  if (rrule.startsWith('FREQ=DAILY')) {
    return shiftCalendarDate(dueDate, 1);
  }
  if (rrule.startsWith('FREQ=WEEKLY')) {
    return shiftCalendarDate(dueDate, 7);
  }
  if (rrule.startsWith('FREQ=MONTHLY')) {
    return addMonths(dueDate, 1);
  }
  if (rrule.startsWith('FREQ=YEARLY')) {
    return addYears(dueDate, 1);
  }
  return null;
}

function expandEventDates(
  startDate: string,
  rrule: string | null,
  exdates: readonly string[],
  from: string,
  to: string,
): string[] {
  const excluded = new Set(exdates);
  const dates: string[] = [];
  if (rrule === null) {
    if (startDate >= from && startDate <= to && !excluded.has(startDate)) {
      dates.push(startDate);
    }
    return dates;
  }
  let cursor = startDate;
  let guard = 0;
  while (cursor < from && guard < 2_000) {
    const next = nextSimpleOccurrence(cursor, rrule);
    if (next === null || next <= cursor) {
      return dates;
    }
    cursor = next;
    guard += 1;
  }
  while (cursor <= to && guard < 2_000) {
    if (!excluded.has(cursor)) {
      dates.push(cursor);
    }
    const next = nextSimpleOccurrence(cursor, rrule);
    if (next === null || next <= cursor) {
      break;
    }
    cursor = next;
    guard += 1;
  }
  return dates;
}

function eventView(row: repo.CalendarEventRow, residentIds: readonly string[]): CalendarEvent {
  return {
    id: row.id,
    version: row.version,
    familyId: row.familyId,
    houseId: row.houseId,
    visibility: row.visibility,
    ownerAccountId: row.ownerAccountId,
    title: row.title,
    description: row.description,
    location: row.location,
    startsAt: row.startsAt.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    endsAt: row.endsAt.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    allDay: row.allDay,
    timezone: row.timezone,
    rrule: row.rrule,
    exdates: row.exdates,
    category: row.category,
    source: row.source,
    icsUid: row.icsUid,
    icsSourceLabel: row.icsSourceLabel,
    residentIds: [...residentIds],
    createdAt: row.createdAt.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    updatedAt: row.updatedAt.toISOString().replace(/\.\d{3}Z$/, 'Z'),
  };
}

function normalizeTime(value: string): string {
  return value.slice(0, 5);
}

function timetableView(row: repo.TimetableSlotRow): TimetableSlot {
  return {
    id: row.id,
    version: row.version,
    familyId: row.familyId,
    residentId: row.residentId,
    weekday: row.weekday,
    startsAt: normalizeTime(row.startsAt),
    endsAt: normalizeTime(row.endsAt),
    title: row.title,
    location: row.location,
    validFrom: row.validFrom,
    validTo: row.validTo,
    createdAt: row.createdAt.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    updatedAt: row.updatedAt.toISOString().replace(/\.\d{3}Z$/, 'Z'),
  };
}

function rangeInstants(from: string, to: string): { fromInstant: Date; toInstant: Date } {
  // Bound the window loosely in UTC so family-local midnights are always covered.
  return {
    fromInstant: new Date(`${from}T00:00:00.000Z`),
    toInstant: new Date(`${shiftCalendarDate(to, 1)}T00:00:00.000Z`),
  };
}

function compareOccurrences(a: CalendarOccurrence, b: CalendarOccurrence): number {
  if (a.startDate !== b.startDate) {
    return a.startDate < b.startDate ? -1 : 1;
  }
  const aTime = a.startTime ?? '00:00';
  const bTime = b.startTime ?? '00:00';
  if (aTime !== bTime) {
    return aTime < bTime ? -1 : 1;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Family calendar: appointments, weekly schedules, chores and deadlines, plus calendar-file export.
 * No plan feature gate — Free includes everyday calendar use.
 *
 * Preconditions: the caller is a resolved tenant with `calendar.read` / `calendar.write` as needed.
 * Postconditions: board and export stay inside the requested date range (max 366 days).
 * Data contract: occurrences mix stored events with schedules and deadline sources already in Postgres.
 *
 * @param db - Database bound to the `domusafe_app` pool.
 * @param now - Clock, injectable for tests.
 * @returns The service.
 */
export function createCalendarService(db: Database, now: () => Date = () => new Date()) {
  async function inFamily<T>(tenant: TenantContext, work: (tx: Transaction) => Promise<T>): Promise<T> {
    return withContext(
      db,
      { principal: { kind: 'account', accountId: tenant.accountId }, familyId: tenant.familyId },
      work,
    );
  }

  async function requireHouse(tx: Transaction, familyId: string, houseId: string): Promise<void> {
    if ((await repo.findHouse(tx, familyId, houseId)) === null) {
      throw new ProblemError('not_found');
    }
  }

  async function requireResident(tx: Transaction, familyId: string, residentId: string): Promise<void> {
    if ((await repo.findResident(tx, familyId, residentId)) === null) {
      throw new ProblemError('not_found');
    }
  }

  async function loadEventView(tx: Transaction, row: repo.CalendarEventRow): Promise<CalendarEvent> {
    const residentIds = await repo.listEventResidentIds(tx, row.familyId, row.id);
    return eventView(row, residentIds);
  }

  function writeScope(tenant: TenantContext): 'all' | 'scoped' | 'own' {
    const decision = decide(
      { role: tenant.role, isOwner: tenant.isOwner, vaultFamilyConcession: tenant.vaultFamily },
      'calendar.write',
    );
    if (!decision.allowed) {
      throw new ProblemError('forbidden');
    }
    return decision.scope;
  }

  async function buildBoard(
    tx: Transaction,
    tenant: TenantContext,
    query: { readonly from: string; readonly to: string; readonly houseId: string },
  ): Promise<CalendarBoard> {
    const meta = await repo.familyMeta(tx, tenant.familyId);
    if (meta === null || (await repo.findHouse(tx, tenant.familyId, query.houseId)) === null) {
      throw new ProblemError('not_found');
    }
    const { fromInstant, toInstant } = rangeInstants(query.from, query.to);
    const subject = {
      role: tenant.role,
      isOwner: tenant.isOwner,
      vaultFamilyConcession: tenant.vaultFamily,
    };
    const taxes = decide(subject, 'taxes.read');
    const succession = decide(subject, 'vault.family.read');
    const items: CalendarOccurrence[] = [];

    const events = await repo.listEventsForBoard(tx, tenant.familyId, fromInstant, toInstant, query.houseId);
    for (const event of events) {
      const residentIds = await repo.listEventResidentIds(tx, tenant.familyId, event.id);
      const startDate = calendarDateInTimeZone(event.startsAt, event.timezone);
      const endDate = calendarDateInTimeZone(event.endsAt, event.timezone);
      const durationDays = (() => {
        let count = 0;
        let cursor = startDate;
        while (cursor < endDate && count < 60) {
          cursor = shiftCalendarDate(cursor, 1);
          count += 1;
        }
        return count;
      })();
      const startTime = event.allDay ? null : clockFromInstant(event.startsAt, event.timezone);
      const endTime = event.allDay ? null : clockFromInstant(event.endsAt, event.timezone);
      for (const occurrenceDate of expandEventDates(
        startDate,
        event.rrule,
        event.exdates,
        query.from,
        query.to,
      )) {
        const occurrenceEnd = shiftCalendarDate(occurrenceDate, durationDays);
        items.push({
          id: `event:${event.id}:${occurrenceDate}`,
          kind: 'event',
          sourceId: event.id,
          title: event.title,
          description: event.description,
          location: event.location,
          startDate: occurrenceDate,
          endDate: occurrenceEnd < occurrenceDate ? occurrenceDate : occurrenceEnd,
          startTime,
          endTime,
          allDay: event.allDay,
          category: event.category,
          deadlineKind: null,
          houseId: event.houseId,
          residentIds,
          version: event.version,
        });
      }
    }

    for (const chore of await repo.listChoresInRange(
      tx,
      tenant.familyId,
      query.houseId,
      query.from,
      query.to,
    )) {
      items.push({
        id: `chore:${chore.id}:${chore.nextDueDate}`,
        kind: 'chore',
        sourceId: chore.id,
        title: chore.title,
        description: chore.description,
        location: null,
        startDate: chore.nextDueDate,
        endDate: chore.nextDueDate,
        startTime: null,
        endTime: null,
        allDay: true,
        category: null,
        deadlineKind: null,
        houseId: chore.houseId,
        residentIds: [...chore.assignedResidentIds],
        version: null,
      });
    }

    for (const task of await repo.listMaintenanceInRange(
      tx,
      tenant.familyId,
      query.houseId,
      query.from,
      query.to,
    )) {
      items.push({
        id: `deadline:maintenance:${task.id}`,
        kind: 'deadline',
        sourceId: task.id,
        title: task.title,
        description: null,
        location: null,
        startDate: task.dueDate,
        endDate: task.dueDate,
        startTime: null,
        endTime: null,
        allDay: true,
        category: null,
        deadlineKind: 'maintenance',
        houseId: task.houseId,
        residentIds: [],
        version: null,
      });
    }

    for (const vehicle of await repo.listVehicleDates(tx, tenant.familyId)) {
      const push = (kind: CalendarOccurrence['deadlineKind'], due: string | null, label: string): void => {
        if (due === null || due < query.from || due > query.to || kind === null) {
          return;
        }
        items.push({
          id: `deadline:${kind}:${vehicle.id}`,
          kind: 'deadline',
          sourceId: vehicle.id,
          title: `${label} · ${vehicle.plate}`,
          description: null,
          location: null,
          startDate: due,
          endDate: due,
          startTime: null,
          endTime: null,
          allDay: true,
          category: null,
          deadlineKind: kind,
          houseId: null,
          residentIds: [],
          version: null,
        });
      };
      push('vehicle_insurance', vehicle.insuranceRenewalDate, 'Rinnovo assicurazione');
      push('vehicle_road_tax', vehicle.roadTaxDueDate, 'Scadenza tassa di circolazione');
      push('vehicle_inspection', vehicle.inspectionDueDate, 'Scadenza revisione');
    }

    if (taxes.allowed && hasFeature(tenant.plan.tier, 'taxes')) {
      const taxRows = await repo.listOpenTaxDates(
        tx,
        tenant.familyId,
        taxes.scope === 'own' ? tenant.accountId : null,
      );
      for (const item of taxRows) {
        if (item.dueDate < query.from || item.dueDate > query.to) {
          continue;
        }
        items.push({
          id: `deadline:tax:${item.id}`,
          kind: 'deadline',
          sourceId: item.id,
          title: `Adempimento fiscale ${String(item.taxYear)}`,
          description: item.itemKey,
          location: null,
          startDate: item.dueDate,
          endDate: item.dueDate,
          startTime: null,
          endTime: null,
          allDay: true,
          category: null,
          deadlineKind: 'tax',
          houseId: null,
          residentIds: [],
          version: null,
        });
      }
    }

    if (succession.allowed && hasFeature(tenant.plan.tier, 'succession')) {
      for (const item of await repo.listSuccessionHints(tx, tenant.familyId)) {
        const dueDate = successionCalendarDate(item.deadlineNote);
        if (dueDate === null || dueDate < query.from || dueDate > query.to) {
          continue;
        }
        items.push({
          id: `deadline:succession:${item.id}`,
          kind: 'deadline',
          sourceId: item.id,
          title: item.title ?? 'Attività di successione',
          description: null,
          location: null,
          startDate: dueDate,
          endDate: dueDate,
          startTime: null,
          endTime: null,
          allDay: true,
          category: null,
          deadlineKind: 'succession',
          houseId: null,
          residentIds: [],
          version: null,
        });
      }
    }

    for (const slot of await repo.listTimetableSlotsForBoard(tx, tenant.familyId)) {
      let cursor = query.from;
      while (cursor <= query.to) {
        if (
          isoWeekday(cursor) === slot.weekday &&
          (slot.validFrom === null || cursor >= slot.validFrom) &&
          (slot.validTo === null || cursor <= slot.validTo)
        ) {
          items.push({
            id: `timetable:${slot.id}:${cursor}`,
            kind: 'timetable',
            sourceId: slot.id,
            title: slot.title,
            description: null,
            location: slot.location,
            startDate: cursor,
            endDate: cursor,
            startTime: normalizeTime(slot.startsAt),
            endTime: normalizeTime(slot.endsAt),
            allDay: false,
            category: null,
            deadlineKind: null,
            houseId: null,
            residentIds: [slot.residentId],
            version: slot.version,
          });
        }
        cursor = shiftCalendarDate(cursor, 1);
      }
    }

    items.sort(compareOccurrences);
    return { timezone: meta.timezone, from: query.from, to: query.to, items };
  }

  async function trace(
    tx: Transaction,
    tenant: TenantContext,
    input: {
      readonly resourceType: string;
      readonly resourceId: string;
      readonly version: number;
      readonly op: 'create' | 'update' | 'delete';
      readonly action: string;
      readonly data: Record<string, unknown>;
    },
  ): Promise<void> {
    const actor = { kind: 'account' as const, id: tenant.accountId };
    await recordRevision(tx, {
      familyId: tenant.familyId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      version: input.version,
      op: input.op,
      actor,
      data: input.data,
    });
    await recordAudit(tx, {
      familyId: tenant.familyId,
      actor,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      outcome: 'success',
      metadata: { version: input.version },
    });
  }

  return {
    /**
     * Lists stored calendar events that overlap a date range.
     *
     * @param tenant - Resolved tenant.
     * @param query - Range, optional house and page.
     * @returns A page of events.
     */
    listEvents(
      tenant: TenantContext,
      query: {
        readonly from: string;
        readonly to: string;
        readonly houseId?: string | undefined;
        readonly limit: number;
        readonly after: readonly [string, string] | null;
      },
    ): Promise<Page<CalendarEvent>> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          const meta = await repo.familyMeta(tx, tenant.familyId);
          if (meta === null) {
            throw new ProblemError('not_found');
          }
          if (query.houseId !== undefined) {
            await requireHouse(tx, tenant.familyId, query.houseId);
          }
          const { fromInstant, toInstant } = rangeInstants(query.from, query.to);
          const rows = await repo.listEvents(tx, {
            familyId: tenant.familyId,
            fromInstant,
            toInstant,
            houseId: query.houseId,
            limit: query.limit,
            after: query.after,
          });
          return pageOfStarts(rows, query.limit, (row) => loadEventView(tx, row));
        }),
      );
    },

    /**
     * Creates a calendar event.
     *
     * @param tenant - Resolved tenant.
     * @param input - Create body.
     * @returns The created event.
     */
    createEvent(tenant: TenantContext, input: CreateCalendarEventRequest): Promise<CalendarEvent> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          const scope = writeScope(tenant);
          const meta = await repo.familyMeta(tx, tenant.familyId);
          if (meta === null) {
            throw new ProblemError('not_found');
          }
          if (input.houseId !== undefined) {
            await requireHouse(tx, tenant.familyId, input.houseId);
          }
          for (const residentId of input.residentIds ?? []) {
            await requireResident(tx, tenant.familyId, residentId);
          }
          const visibility = scope === 'own' ? 'personal' : input.visibility;
          const ownerAccountId = visibility === 'personal' ? tenant.accountId : null;
          const row = await repo.insertEvent(tx, {
            familyId: tenant.familyId,
            houseId: input.houseId ?? null,
            visibility,
            ownerAccountId,
            title: input.title,
            description: input.description ?? null,
            location: input.location ?? null,
            startsAt: new Date(input.startsAt),
            endsAt: new Date(input.endsAt),
            allDay: input.allDay,
            timezone: input.timezone ?? meta.timezone,
            rrule: input.rrule ?? null,
            exdates: input.exdates ?? [],
            category: input.category,
            createdBy: tenant.accountId,
          });
          await repo.replaceEventResidents(tx, tenant.familyId, row.id, input.residentIds ?? []);
          await trace(tx, tenant, {
            resourceType: 'calendar_events',
            resourceId: row.id,
            version: row.version,
            op: 'create',
            action: 'calendar.event.created',
            data: { title: row.title, startsAt: row.startsAt.toISOString() },
          });
          return loadEventView(tx, row);
        }),
      );
    },

    /**
     * Updates a calendar event.
     *
     * @param tenant - Resolved tenant.
     * @param eventId - Event id.
     * @param expectedVersion - Version the form was loaded with.
     * @param patch - Fields to change.
     * @returns The updated event.
     */
    updateEvent(
      tenant: TenantContext,
      eventId: string,
      expectedVersion: number,
      patch: UpdateCalendarEventRequest,
    ): Promise<CalendarEvent> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          writeScope(tenant);
          const existing = await repo.getEvent(tx, tenant.familyId, eventId);
          if (existing === null) {
            throw new ProblemError('not_found');
          }
          if (existing.version !== expectedVersion) {
            conflict(existing.version);
          }
          if (patch.houseId !== undefined && patch.houseId !== null) {
            await requireHouse(tx, tenant.familyId, patch.houseId);
          }
          if (patch.residentIds !== undefined) {
            for (const residentId of patch.residentIds) {
              await requireResident(tx, tenant.familyId, residentId);
            }
          }
          const startsAt = patch.startsAt === undefined ? existing.startsAt : new Date(patch.startsAt);
          const endsAt = patch.endsAt === undefined ? existing.endsAt : new Date(patch.endsAt);
          if (endsAt.getTime() < startsAt.getTime()) {
            throw new ProblemError('validation_failed', {
              detail: 'endsAt must be on or after startsAt',
            });
          }
          const visibility = patch.visibility ?? existing.visibility;
          const ownerAccountId =
            visibility === 'personal' ? (existing.ownerAccountId ?? tenant.accountId) : null;
          const updated = await repo.updateEvent(tx, tenant.familyId, eventId, expectedVersion, {
            ...patch,
            startsAt: patch.startsAt === undefined ? undefined : startsAt,
            endsAt: patch.endsAt === undefined ? undefined : endsAt,
            visibility,
            ownerAccountId,
            updatedBy: tenant.accountId,
          });
          if (updated === null) {
            conflict(existing.version);
          }
          if (patch.residentIds !== undefined) {
            await repo.replaceEventResidents(tx, tenant.familyId, eventId, patch.residentIds);
          }
          await trace(tx, tenant, {
            resourceType: 'calendar_events',
            resourceId: updated.id,
            version: updated.version,
            op: 'update',
            action: 'calendar.event.updated',
            data: { title: updated.title },
          });
          return loadEventView(tx, updated);
        }),
      );
    },

    /**
     * Soft-deletes a calendar event.
     *
     * @param tenant - Resolved tenant.
     * @param eventId - Event id.
     * @param expectedVersion - Version the form was loaded with.
     */
    deleteEvent(tenant: TenantContext, eventId: string, expectedVersion: number): Promise<void> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          writeScope(tenant);
          const existing = await repo.getEvent(tx, tenant.familyId, eventId);
          if (existing === null) {
            throw new ProblemError('not_found');
          }
          if (existing.version !== expectedVersion) {
            conflict(existing.version);
          }
          const deleted = await repo.softDeleteEvent(
            tx,
            tenant.familyId,
            eventId,
            expectedVersion,
            tenant.accountId,
          );
          if (deleted === null) {
            conflict(existing.version);
          }
          await trace(tx, tenant, {
            resourceType: 'calendar_events',
            resourceId: deleted.id,
            version: deleted.version,
            op: 'delete',
            action: 'calendar.event.deleted',
            data: { title: deleted.title },
          });
        }),
      );
    },

    /**
     * Lists weekly timetable slots.
     *
     * @param tenant - Resolved tenant.
     * @param query - Optional resident filter and page.
     * @returns A page of slots.
     */
    listTimetable(
      tenant: TenantContext,
      query: {
        readonly residentId?: string | undefined;
        readonly limit: number;
        readonly after: readonly [string, string] | null;
      },
    ): Promise<Page<TimetableSlot>> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          if (query.residentId !== undefined) {
            await requireResident(tx, tenant.familyId, query.residentId);
          }
          const rows = await repo.listTimetableSlots(tx, {
            familyId: tenant.familyId,
            residentId: query.residentId,
            limit: query.limit,
            after: query.after,
          });
          return pageOfCreated(rows, query.limit, timetableView);
        }),
      );
    },

    /**
     * Creates a weekly timetable slot.
     *
     * @param tenant - Resolved tenant.
     * @param input - Create body.
     * @returns The created slot.
     */
    createTimetableSlot(tenant: TenantContext, input: CreateTimetableSlotRequest): Promise<TimetableSlot> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          writeScope(tenant);
          await requireResident(tx, tenant.familyId, input.residentId);
          const row = await repo.insertTimetableSlot(tx, {
            familyId: tenant.familyId,
            residentId: input.residentId,
            weekday: input.weekday,
            startsAt: input.startsAt,
            endsAt: input.endsAt,
            title: input.title,
            location: input.location ?? null,
            validFrom: input.validFrom ?? null,
            validTo: input.validTo ?? null,
            createdBy: tenant.accountId,
          });
          await trace(tx, tenant, {
            resourceType: 'timetable_slots',
            resourceId: row.id,
            version: row.version,
            op: 'create',
            action: 'calendar.timetable.created',
            data: { title: row.title, weekday: row.weekday },
          });
          return timetableView(row);
        }),
      );
    },

    /**
     * Updates a weekly timetable slot.
     *
     * @param tenant - Resolved tenant.
     * @param slotId - Slot id.
     * @param expectedVersion - Version the form was loaded with.
     * @param patch - Fields to change.
     * @returns The updated slot.
     */
    updateTimetableSlot(
      tenant: TenantContext,
      slotId: string,
      expectedVersion: number,
      patch: UpdateTimetableSlotRequest,
    ): Promise<TimetableSlot> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          writeScope(tenant);
          const existing = await repo.getTimetableSlot(tx, tenant.familyId, slotId);
          if (existing === null) {
            throw new ProblemError('not_found');
          }
          if (existing.version !== expectedVersion) {
            conflict(existing.version);
          }
          const startsAt = patch.startsAt ?? normalizeTime(existing.startsAt);
          const endsAt = patch.endsAt ?? normalizeTime(existing.endsAt);
          if (endsAt <= startsAt) {
            throw new ProblemError('validation_failed', { detail: 'endsAt must be after startsAt' });
          }
          const updated = await repo.updateTimetableSlot(tx, tenant.familyId, slotId, expectedVersion, {
            ...patch,
            updatedBy: tenant.accountId,
          });
          if (updated === null) {
            conflict(existing.version);
          }
          await trace(tx, tenant, {
            resourceType: 'timetable_slots',
            resourceId: updated.id,
            version: updated.version,
            op: 'update',
            action: 'calendar.timetable.updated',
            data: { title: updated.title },
          });
          return timetableView(updated);
        }),
      );
    },

    /**
     * Soft-deletes a weekly timetable slot.
     *
     * @param tenant - Resolved tenant.
     * @param slotId - Slot id.
     * @param expectedVersion - Version the form was loaded with.
     */
    deleteTimetableSlot(tenant: TenantContext, slotId: string, expectedVersion: number): Promise<void> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          writeScope(tenant);
          const existing = await repo.getTimetableSlot(tx, tenant.familyId, slotId);
          if (existing === null) {
            throw new ProblemError('not_found');
          }
          if (existing.version !== expectedVersion) {
            conflict(existing.version);
          }
          const deleted = await repo.softDeleteTimetableSlot(
            tx,
            tenant.familyId,
            slotId,
            expectedVersion,
            tenant.accountId,
          );
          if (deleted === null) {
            conflict(existing.version);
          }
          await trace(tx, tenant, {
            resourceType: 'timetable_slots',
            resourceId: deleted.id,
            version: deleted.version,
            op: 'delete',
            action: 'calendar.timetable.deleted',
            data: { title: deleted.title },
          });
        }),
      );
    },

    /**
     * Builds the family calendar board for a date range.
     *
     * @param tenant - Resolved tenant.
     * @param query - Range and open house.
     * @returns Sorted occurrences.
     */
    board(
      tenant: TenantContext,
      query: { readonly from: string; readonly to: string; readonly houseId: string },
    ): Promise<CalendarBoard> {
      return guarded(() => inFamily(tenant, (tx) => buildBoard(tx, tenant, query)));
    },

    /**
     * Builds a downloadable calendar file for the same board range.
     *
     * @param tenant - Resolved tenant.
     * @param query - Range and open house.
     * @returns Filename and calendar-file body.
     */
    export(
      tenant: TenantContext,
      query: { readonly from: string; readonly to: string; readonly houseId: string },
    ): Promise<CalendarExport> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          const board = await buildBoard(tx, tenant, query);
          const meta = await repo.familyMeta(tx, tenant.familyId);
          if (meta === null) {
            throw new ProblemError('not_found');
          }
          const body = buildIcsCalendar({
            calendarName: meta.name,
            timezone: board.timezone,
            stamp: now(),
            items: board.items,
          });
          return {
            filename: `calendario-famiglia-${query.from}-${query.to}.ics`,
            mediaType: 'text/calendar',
            body,
          };
        }),
      );
    },
  };
}

/** Calendar service. */
export type CalendarService = ReturnType<typeof createCalendarService>;
