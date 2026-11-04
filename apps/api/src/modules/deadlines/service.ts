import {
  calendarDateInTimeZone,
  deadlineGroup,
  decide,
  successionCalendarDate,
  type DeadlineBoard,
  type DeadlineItem,
} from '@domusafe/contracts';
import { withContext, type Database, type Transaction } from '@domusafe/db';
import { hasFeature } from '@domusafe/plans';
import { ProblemError } from '../../http/problem.js';
import type { TenantContext } from '../../types.js';
import * as repo from './repository.js';

const account = (accountId: string): { kind: 'account'; accountId: string } => ({
  kind: 'account',
  accountId,
});

/**
 * Overview deadlines. The groups are computed from dates that are already stored.
 * A new maintenance task is written by the house module; this module only reads.
 *
 * Preconditions: the caller is a resolved tenant who may read deadlines.
 * Postconditions: tax and succession rows appear only when the plan includes them and the role may read them.
 * Data contract: each date is in at most one of overdue, this week or this month.
 *
 * @param db - Database bound to the `domusafe_app` pool.
 * @param now - Clock, injectable for tests.
 * @returns The service.
 */
export function createDeadlinesService(db: Database, now: () => Date = () => new Date()) {
  async function inFamily<T>(tenant: TenantContext, work: (tx: Transaction) => Promise<T>): Promise<T> {
    return withContext(db, { principal: account(tenant.accountId), familyId: tenant.familyId }, work);
  }

  return {
    /**
     * Groups the open deadlines of one house and of the family records the caller can read.
     *
     * @param tenant - Resolved tenant.
     * @param houseId - Open house. Maintenance is limited to this house.
     * @returns The three groups and the family calendar date used to build them.
     */
    async list(tenant: TenantContext, houseId: string): Promise<DeadlineBoard> {
      return inFamily(tenant, async (tx) => {
        const timezone = await repo.familyTimeZone(tx, tenant.familyId);
        if (timezone === null || (await repo.findHouse(tx, tenant.familyId, houseId)) === null) {
          throw new ProblemError('not_found');
        }
        const today = calendarDateInTimeZone(now(), timezone);
        const subject = {
          role: tenant.role,
          isOwner: tenant.isOwner,
          vaultFamilyConcession: tenant.vaultFamily,
        };
        const taxes = decide(subject, 'taxes.read');
        const succession = decide(subject, 'vault.family.read');
        const maintenance = await repo.listOpenMaintenance(tx, tenant.familyId, houseId);
        const vehicleRows = await repo.listVehicleDates(tx, tenant.familyId);
        const taxRows =
          taxes.allowed && hasFeature(tenant.plan.tier, 'taxes')
            ? await repo.listOpenTaxDates(
                tx,
                tenant.familyId,
                taxes.scope === 'own' ? tenant.accountId : null,
              )
            : [];
        const successionRows =
          succession.allowed && hasFeature(tenant.plan.tier, 'succession')
            ? await repo.listSuccessionHints(tx, tenant.familyId)
            : [];

        const items: DeadlineItem[] = [];
        for (const task of maintenance) {
          items.push({
            kind: 'maintenance',
            sourceId: task.id,
            dueDate: task.dueDate,
            title: task.title,
            detail: null,
            taxItemKey: null,
            successionKind: null,
            version: task.version,
            houseId: task.houseId,
          });
        }
        for (const vehicle of vehicleRows) {
          pushVehicle(items, vehicle.id, vehicle.plate, 'vehicle_insurance', vehicle.insuranceRenewalDate);
          pushVehicle(items, vehicle.id, vehicle.plate, 'vehicle_road_tax', vehicle.roadTaxDueDate);
          pushVehicle(items, vehicle.id, vehicle.plate, 'vehicle_inspection', vehicle.inspectionDueDate);
        }
        for (const item of taxRows) {
          items.push({
            kind: 'tax',
            sourceId: item.id,
            dueDate: item.dueDate,
            title: null,
            detail: String(item.taxYear),
            taxItemKey: item.itemKey,
            successionKind: null,
            version: null,
            houseId: null,
          });
        }
        for (const item of successionRows) {
          const dueDate = successionCalendarDate(item.deadlineNote);
          if (dueDate === null) {
            continue;
          }
          items.push({
            kind: 'succession',
            sourceId: item.id,
            dueDate,
            title: item.title,
            detail: null,
            taxItemKey: null,
            successionKind: item.kind,
            version: null,
            houseId: null,
          });
        }

        const overdue: DeadlineItem[] = [];
        const week: DeadlineItem[] = [];
        const month: DeadlineItem[] = [];
        for (const item of items) {
          const group = deadlineGroup(item.dueDate, today);
          if (group === 'overdue') {
            overdue.push(item);
          } else if (group === 'week') {
            week.push(item);
          } else if (group === 'month') {
            month.push(item);
          }
        }
        overdue.sort(byDate);
        week.sort(byDate);
        month.sort(byDate);
        return { timezone, today, overdue, week, month };
      });
    },
  };
}

/** Deadlines service. */
export type DeadlinesService = ReturnType<typeof createDeadlinesService>;

function pushVehicle(
  items: DeadlineItem[],
  sourceId: string,
  plate: string,
  kind: 'vehicle_insurance' | 'vehicle_road_tax' | 'vehicle_inspection',
  dueDate: string | null,
): void {
  if (dueDate === null) {
    return;
  }
  items.push({
    kind,
    sourceId,
    dueDate,
    title: null,
    detail: plate,
    taxItemKey: null,
    successionKind: null,
    version: null,
    houseId: null,
  });
}

function byDate(left: DeadlineItem, right: DeadlineItem): number {
  const byDue = left.dueDate.localeCompare(right.dueDate);
  if (byDue !== 0) {
    return byDue;
  }
  const byKind = left.kind.localeCompare(right.kind);
  if (byKind !== 0) {
    return byKind;
  }
  return left.sourceId.localeCompare(right.sourceId);
}
