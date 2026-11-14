import {
  decide,
  decodeCursor,
  encodeCursor,
  type ExportCatalog,
  type ExportModule,
  type ExportRecord,
  type ExportRecordsPage,
  type ExportRecordsQuery,
  type Permission,
} from '@domusafe/contracts';
import { toBase64Url } from '@domusafe/crypto';
import { withContext, type Database, type Transaction } from '@domusafe/db';
import { ProblemError } from '../../http/problem.js';
import type { TenantContext } from '../../types.js';
import * as repo from './repository.js';

const account = (accountId: string): { kind: 'account'; accountId: string } => ({
  kind: 'account',
  accountId,
});

interface SourceRow {
  readonly id: string;
  readonly version: number;
  readonly createdAt: Date;
  readonly data: ExportRecord['data'];
}

interface ExportSource {
  readonly module: ExportModule;
  readonly table: string;
  readonly permission: Permission;
  readonly list: (tx: Transaction, familyId: string, page: repo.ExportPage) => Promise<SourceRow[]>;
}

function instant(value: Date | null | undefined): string | null {
  return value === null || value === undefined ? null : value.toISOString();
}

function sealedOf(row: {
  readonly encScopeId: string | null;
  readonly encKeyVersion: number | null;
  readonly encDek: Uint8Array<ArrayBuffer> | null;
  readonly encPayload: Uint8Array<ArrayBuffer> | null;
}): Record<string, string | number | boolean | null> | null {
  if (
    row.encScopeId === null ||
    row.encKeyVersion === null ||
    row.encDek === null ||
    row.encPayload === null
  ) {
    return null;
  }
  return {
    scopeId: row.encScopeId,
    keyVersion: row.encKeyVersion,
    dek: toBase64Url(row.encDek),
    payload: toBase64Url(row.encPayload),
  };
}

function mapMany<T extends { id: string; version: number; createdAt: Date }>(
  rows: T[],
  view: (row: T) => ExportRecord['data'],
): SourceRow[] {
  return rows.map((row) => ({
    id: row.id,
    version: row.version,
    createdAt: row.createdAt,
    data: view(row),
  }));
}

const SOURCES: readonly ExportSource[] = [
  {
    module: 'residents',
    table: 'residents',
    permission: 'residents.read',
    list: async (tx, familyId, page) =>
      mapMany(await repo.listResidents(tx, familyId, page), (row) => ({
        familyId: row.familyId,
        displayName: row.displayName,
        kind: row.kind,
        birthYear: row.birthYear,
        usualBedroom: row.usualBedroom,
        photo: row.photo,
        accountId: row.accountId,
        color: row.color,
        sortOrder: row.sortOrder,
        createdAt: instant(row.createdAt),
        updatedAt: instant(row.updatedAt),
      })),
  },
  {
    module: 'pets',
    table: 'pets',
    permission: 'pets.read',
    list: async (tx, familyId, page) =>
      mapMany(await repo.listPets(tx, familyId, page), (row) => ({
        familyId: row.familyId,
        name: row.name,
        species: row.species,
        breed: row.breed,
        notes: row.notes,
        vetName: row.vetName,
        vetPhone: row.vetPhone,
        vetAddress: row.vetAddress,
        createdAt: instant(row.createdAt),
        updatedAt: instant(row.updatedAt),
      })),
  },
  {
    module: 'contacts',
    table: 'contacts',
    permission: 'contacts.read',
    list: async (tx, familyId, page) =>
      mapMany(await repo.listContacts(tx, familyId, page), (row) => ({
        familyId: row.familyId,
        houseId: row.houseId,
        kind: row.kind,
        trade: row.trade,
        displayName: row.displayName,
        company: row.company,
        phone: row.phone,
        email: row.email,
        website: row.website,
        address: row.address,
        notes: row.notes,
        rating: row.rating,
        visibleToGuests: row.visibleToGuests,
        createdAt: instant(row.createdAt),
        updatedAt: instant(row.updatedAt),
      })),
  },
  {
    module: 'utilities',
    table: 'utilities',
    permission: 'utilities.read',
    list: async (tx, familyId, page) =>
      mapMany(await repo.listUtilities(tx, familyId, page), (row) => ({
        familyId: row.familyId,
        houseId: row.houseId,
        kind: row.kind,
        providerName: row.providerName,
        customerCode: row.customerCode,
        contractCode: row.contractCode,
        supplyPointCode: row.supplyPointCode,
        tariffName: row.tariffName,
        startDate: row.startDate,
        renewalDate: row.renewalDate,
        billingFrequency: row.billingFrequency,
        estimatedCostMinor: row.estimatedCostMinor,
        currency: row.currency,
        autopay: row.autopay,
        notes: row.notes,
        sealed: sealedOf(row),
        createdAt: instant(row.createdAt),
        updatedAt: instant(row.updatedAt),
      })),
  },
  {
    module: 'inventory',
    table: 'rooms',
    permission: 'house.read',
    list: async (tx, familyId, page) =>
      mapMany(await repo.listRooms(tx, familyId, page), (row) => ({
        familyId: row.familyId,
        houseId: row.houseId,
        name: row.name,
        kind: row.kind,
        floor: row.floor,
        sortOrder: row.sortOrder,
        notes: row.notes,
        createdAt: instant(row.createdAt),
        updatedAt: instant(row.updatedAt),
      })),
  },
  {
    module: 'inventory',
    table: 'storage_units',
    permission: 'inventory.read',
    list: async (tx, familyId, page) =>
      mapMany(await repo.listStorageUnits(tx, familyId, page), (row) => ({
        familyId: row.familyId,
        houseId: row.houseId,
        roomId: row.roomId,
        parentId: row.parentId,
        kind: row.kind,
        name: row.name,
        notes: row.notes,
        sortOrder: row.sortOrder,
        createdAt: instant(row.createdAt),
        updatedAt: instant(row.updatedAt),
      })),
  },
  {
    module: 'inventory',
    table: 'inventory_items',
    permission: 'inventory.read',
    list: async (tx, familyId, page) =>
      mapMany(await repo.listInventoryItems(tx, familyId, page), (row) => ({
        familyId: row.familyId,
        houseId: row.houseId,
        roomId: row.roomId,
        storageUnitId: row.storageUnitId,
        name: row.name,
        category: row.category,
        quantity: row.quantity,
        unit: row.unit,
        brand: row.brand,
        model: row.model,
        serialNumber: row.serialNumber,
        barcode: row.barcode,
        purchaseDate: row.purchaseDate,
        purchasePriceMinor: row.purchasePriceMinor,
        currency: row.currency,
        warrantyUntil: row.warrantyUntil,
        warrantyNotes: row.warrantyNotes,
        tags: row.tags,
        notes: row.notes,
        photoCaption: row.photoCaption,
        createdAt: instant(row.createdAt),
        updatedAt: instant(row.updatedAt),
      })),
  },
  {
    module: 'house',
    table: 'houses',
    permission: 'houses.read',
    list: async (tx, familyId, page) =>
      mapMany(await repo.listHouses(tx, familyId, page), (row) => ({
        familyId: row.familyId,
        name: row.name,
        addressLine: row.addressLine,
        postalCode: row.postalCode,
        city: row.city,
        province: row.province,
        country: row.country,
        sortOrder: row.sortOrder,
        createdAt: instant(row.createdAt),
        updatedAt: instant(row.updatedAt),
      })),
  },
  {
    module: 'house',
    table: 'house_guide_entries',
    permission: 'house.read',
    list: async (tx, familyId, page) =>
      mapMany(await repo.listGuideEntries(tx, familyId, page), (row) => ({
        familyId: row.familyId,
        houseId: row.houseId,
        audience: row.audience,
        topic: row.topic,
        title: row.title,
        body: row.body,
        sortOrder: row.sortOrder,
        sealed: sealedOf(row),
        createdAt: instant(row.createdAt),
        updatedAt: instant(row.updatedAt),
      })),
  },
  {
    module: 'house',
    table: 'house_shutoffs',
    permission: 'house.read',
    list: async (tx, familyId, page) =>
      mapMany(await repo.listShutoffs(tx, familyId, page), (row) => ({
        familyId: row.familyId,
        houseId: row.houseId,
        kind: row.kind,
        location: row.location,
        instructions: row.instructions,
        visibleToGuests: row.visibleToGuests,
        createdAt: instant(row.createdAt),
        updatedAt: instant(row.updatedAt),
      })),
  },
  {
    module: 'house',
    table: 'waste_collections',
    permission: 'house.read',
    list: async (tx, familyId, page) =>
      mapMany(await repo.listWaste(tx, familyId, page), (row) => ({
        familyId: row.familyId,
        houseId: row.houseId,
        fraction: row.fraction,
        rrule: row.rrule,
        collectionTime: row.collectionTime,
        instructions: row.instructions,
        createdAt: instant(row.createdAt),
        updatedAt: instant(row.updatedAt),
      })),
  },
  {
    module: 'deadlines',
    table: 'maintenance_tasks',
    permission: 'deadlines.read',
    list: async (tx, familyId, page) =>
      mapMany(await repo.listMaintenance(tx, familyId, page), (row) => ({
        familyId: row.familyId,
        houseId: row.houseId,
        contactId: row.contactId,
        category: row.category,
        priority: row.priority,
        title: row.title,
        description: row.description,
        rrule: row.rrule,
        nextDueDate: row.nextDueDate,
        lastDoneOn: row.lastDoneOn,
        estimatedCostMinor: row.estimatedCostMinor,
        currency: row.currency,
        active: row.active,
        createdAt: instant(row.createdAt),
        updatedAt: instant(row.updatedAt),
      })),
  },
  {
    module: 'vault',
    table: 'vault_items',
    permission: 'vault.family.read',
    list: async (tx, familyId, page) =>
      mapMany(await repo.listVaultItems(tx, familyId, page), (row) => ({
        familyId: row.familyId,
        section: row.section,
        sealed: {
          scopeId: row.encScopeId,
          keyVersion: row.encKeyVersion,
          dek: toBase64Url(row.encDek),
          payload: toBase64Url(row.encPayload),
        },
        createdAt: instant(row.createdAt),
        updatedAt: instant(row.updatedAt),
      })),
  },
  {
    module: 'personale',
    table: 'phone_lines',
    permission: 'personal.read',
    list: async (tx, familyId, page) =>
      mapMany(await repo.listPhoneLines(tx, familyId, page), (row) => ({
        familyId: row.familyId,
        residentId: row.residentId,
        operatorName: row.operatorName,
        phoneNumber: row.phoneNumber,
        planName: row.planName,
        monthlyCostMinor: row.monthlyCostMinor,
        currency: row.currency,
        renewalDate: row.renewalDate,
        createdAt: instant(row.createdAt),
        updatedAt: instant(row.updatedAt),
      })),
  },
  {
    module: 'personale',
    table: 'subscriptions',
    permission: 'personal.read',
    list: async (tx, familyId, page) =>
      mapMany(await repo.listSubscriptions(tx, familyId, page), (row) => ({
        familyId: row.familyId,
        residentId: row.residentId,
        name: row.name,
        providerName: row.providerName,
        renewalDate: row.renewalDate,
        costMinor: row.costMinor,
        currency: row.currency,
        notes: row.notes,
        createdAt: instant(row.createdAt),
        updatedAt: instant(row.updatedAt),
      })),
  },
  {
    module: 'personale',
    table: 'vehicles',
    permission: 'personal.read',
    list: async (tx, familyId, page) =>
      mapMany(await repo.listVehicles(tx, familyId, page), (row) => ({
        familyId: row.familyId,
        residentId: row.residentId,
        plate: row.plate,
        make: row.make,
        model: row.model,
        insuranceRenewalDate: row.insuranceRenewalDate,
        roadTaxDueDate: row.roadTaxDueDate,
        inspectionDueDate: row.inspectionDueDate,
        createdAt: instant(row.createdAt),
        updatedAt: instant(row.updatedAt),
      })),
  },
  {
    module: 'calendar',
    table: 'calendar_events',
    permission: 'calendar.read',
    list: async (tx, familyId, page) =>
      mapMany(await repo.listCalendarEvents(tx, familyId, page), (row) => ({
        familyId: row.familyId,
        houseId: row.houseId,
        title: row.title,
        description: row.description,
        location: row.location,
        startsAt: instant(row.startsAt),
        endsAt: instant(row.endsAt),
        allDay: row.allDay,
        timezone: row.timezone,
        rrule: row.rrule,
        exdates: row.exdates,
        category: row.category,
        source: row.source,
        createdAt: instant(row.createdAt),
        updatedAt: instant(row.updatedAt),
      })),
  },
  {
    module: 'calendar',
    table: 'timetable_slots',
    permission: 'calendar.read',
    list: async (tx, familyId, page) =>
      mapMany(await repo.listTimetableSlots(tx, familyId, page), (row) => ({
        familyId: row.familyId,
        residentId: row.residentId,
        weekday: row.weekday,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        title: row.title,
        location: row.location,
        validFrom: row.validFrom,
        validTo: row.validTo,
        createdAt: instant(row.createdAt),
        updatedAt: instant(row.updatedAt),
      })),
  },
];

function subjectOf(tenant: TenantContext) {
  return {
    role: tenant.role,
    isOwner: tenant.isOwner,
    vaultFamilyConcession: tenant.vaultFamily,
  };
}

function canRead(tenant: TenantContext, permission: Permission): boolean {
  return decide(subjectOf(tenant), permission).allowed;
}

function sourcesFor(tenant: TenantContext, module: ExportModule | undefined): ExportSource[] {
  return SOURCES.filter(
    (source) => (module === undefined || source.module === module) && canRead(tenant, source.permission),
  );
}

interface StreamCursor {
  readonly sourceIndex: number;
  readonly sortKey: string;
  readonly id: string;
}

function encodeStreamCursor(cursor: StreamCursor): string {
  return encodeCursor([`${String(cursor.sourceIndex)}:${cursor.sortKey}`, cursor.id]);
}

function decodeStreamCursor(cursor: string): StreamCursor | null {
  const position = decodeCursor(cursor);
  if (position === null || typeof position[0] !== 'string') {
    return null;
  }
  const separator = position[0].indexOf(':');
  if (separator <= 0) {
    return null;
  }
  const sourceIndex = Number(position[0].slice(0, separator));
  const sortKey = position[0].slice(separator + 1);
  if (!Number.isInteger(sourceIndex) || sourceIndex < 0 || sortKey.length === 0) {
    return null;
  }
  return { sourceIndex, sortKey, id: position[1] };
}

/**
 * Family data export for browser-assembled backup and CSV (phase 1 §7.3 `backup`, phase 3 §5.6).
 *
 * Preconditions: the caller holds `export.full`; each source still applies its own read permission and RLS.
 * Postconditions: pages never decrypt class A/B envelopes; sealed fields stay base64url as stored.
 * Data contract: records match {@link ExportRecord}.
 *
 * @param db - Database bound to the `domusafe_app` pool.
 * @returns The service.
 */
export function createBackupService(db: Database) {
  async function inFamily<T>(tenant: TenantContext, work: (tx: Transaction) => Promise<T>): Promise<T> {
    return withContext(db, { principal: account(tenant.accountId), familyId: tenant.familyId }, work);
  }

  return {
    /**
     * Lists modules and tables the caller may export.
     *
     * @param tenant - Resolved tenant.
     * @returns Catalog with a `readable` flag per module.
     */
    catalog(tenant: TenantContext): ExportCatalog {
      const modules = new Map<ExportModule, { readable: boolean; tables: string[] }>();
      for (const source of SOURCES) {
        const readable = canRead(tenant, source.permission);
        const current = modules.get(source.module) ?? { readable: false, tables: [] };
        if (readable) {
          current.readable = true;
          current.tables.push(source.table);
        }
        modules.set(source.module, current);
      }
      return {
        modules: [...modules.entries()].map(([module, value]) => ({
          module,
          readable: value.readable,
          tables: value.tables,
        })),
      };
    },

    /**
     * Pages export records across readable sources.
     *
     * @param tenant - Resolved tenant.
     * @param query - Optional module filter, limit and cursor.
     * @returns A page of records and the next cursor.
     */
    async listRecords(tenant: TenantContext, query: ExportRecordsQuery): Promise<ExportRecordsPage> {
      const sources = sourcesFor(tenant, query.module);
      if (sources.length === 0) {
        return { items: [], nextCursor: null };
      }
      let sourceIndex = 0;
      let after: readonly [string, string] | null = null;
      if (query.cursor !== undefined) {
        const decoded = decodeStreamCursor(query.cursor);
        if (decoded === null || decoded.sourceIndex >= sources.length) {
          throw new ProblemError('cursor_invalid');
        }
        sourceIndex = decoded.sourceIndex;
        after = [decoded.sortKey, decoded.id];
      }

      return inFamily(tenant, async (tx) => {
        const items: ExportRecord[] = [];
        let nextCursor: string | null = null;
        let remaining = query.limit;

        while (sourceIndex < sources.length && remaining > 0) {
          const source = sources[sourceIndex];
          if (source === undefined) {
            break;
          }
          const rows = await source.list(tx, tenant.familyId, { limit: remaining, after });
          const hasMore = rows.length > remaining;
          const slice = hasMore ? rows.slice(0, remaining) : rows;
          for (const row of slice) {
            items.push({
              module: source.module,
              table: source.table,
              id: row.id,
              version: row.version,
              data: row.data,
            });
          }
          remaining -= slice.length;
          after = null;
          if (hasMore) {
            const last = slice.at(-1);
            if (last !== undefined) {
              nextCursor = encodeStreamCursor({
                sourceIndex,
                sortKey: last.createdAt.toISOString(),
                id: last.id,
              });
            }
            break;
          }
          sourceIndex += 1;
          if (sourceIndex < sources.length && remaining === 0) {
            nextCursor = encodeStreamCursor({
              sourceIndex,
              sortKey: '1970-01-01T00:00:00.000Z',
              id: '00000000-0000-7000-8000-000000000000',
            });
          }
        }

        return { items, nextCursor };
      });
    },
  };
}

/** Backup export service. */
export type BackupService = ReturnType<typeof createBackupService>;
