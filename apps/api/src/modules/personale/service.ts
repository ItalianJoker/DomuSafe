import {
  TAX_ITEM_KEYS,
  currencySchema,
  encodeCursor,
  type CreatePersonalBankAccountRequest,
  type CreatePersonalSubscriptionRequest,
  type CreatePetRequest,
  type CreatePhoneLineRequest,
  type CreateResidentRequest,
  type CreateVehicleRequest,
  type GenerateTaxChecklistRequest,
  type PersonalBankAccount,
  type PersonalSubscription,
  type Pet,
  type PhoneLine,
  type PutRescueRequest,
  type ReplaceResidentHousesRequest,
  type RescueCard,
  type RescueSheet,
  type Resident,
  type TaxChecklist,
  type TaxChecklistItem,
  type UpdatePersonalBankAccountRequest,
  type UpdatePersonalSubscriptionRequest,
  type UpdatePetRequest,
  type UpdatePhoneLineRequest,
  type UpdateResidentRequest,
  type UpdateTaxChecklistItemRequest,
  type UpdateVehicleRequest,
  type Vehicle,
} from '@domusafe/contracts';
import { recordAudit, recordRevision, withContext, type Database, type Transaction } from '@domusafe/db';
import { checkLimit } from '@domusafe/plans';
import { ProblemError, classifyDatabaseError } from '../../http/problem.js';
import type { TenantContext } from '../../types.js';
import * as repo from './repository.js';

/** One page of a list. */
export interface Page<T> {
  readonly items: T[];
  readonly nextCursor: string | null;
}

interface Money {
  readonly amountMinor: number;
  readonly currency: NonNullable<PhoneLine['monthlyCost']>['currency'];
}

const account = (accountId: string): { kind: 'account'; accountId: string } => ({
  kind: 'account',
  accountId,
});

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

function phrases(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string');
}

function money(amount: number | null, currency: string | null): Money | null {
  if (amount === null || currency === null) {
    return null;
  }
  const parsed = currencySchema.safeParse(currency.trim());
  if (!parsed.success) {
    throw new Error('Stored currency is not in the catalogue');
  }
  return { amountMinor: amount, currency: parsed.data };
}

function costColumns(
  cost: Money | null | undefined,
): { minor: number | null; currency: string | null } | undefined {
  if (cost === undefined) {
    return undefined;
  }
  if (cost === null) {
    return { minor: null, currency: null };
  }
  return { minor: cost.amountMinor, currency: cost.currency };
}

function pageOf<T extends { readonly id: string }>(
  rows: readonly T[],
  limit: number,
  cursorOf: (row: T) => readonly [string | number, string],
): Page<T> {
  const items = [...rows.slice(0, limit)];
  const last = items.at(-1);
  return {
    items,
    nextCursor: rows.length > limit && last !== undefined ? encodeCursor(cursorOf(last)) : null,
  };
}

function residentView(row: repo.ResidentRow, houseIds: readonly string[]): Resident {
  return {
    id: row.id,
    familyId: row.familyId,
    displayName: row.displayName,
    kind: row.kind,
    birthYear: row.birthYear,
    usualBedroom: row.usualBedroom,
    photo: row.photo,
    color: row.color.trim(),
    houseIds: [...houseIds],
    planLocked: row.planLockedAt !== null,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function medicineView(row: repo.MedicineRow): RescueCard['medicines'][number] {
  return { id: row.id, name: row.name, location: row.location, sortOrder: row.sortOrder };
}

function contactView(row: repo.ContactRow): RescueCard['contacts'][number] {
  return {
    id: row.id,
    displayName: row.displayName,
    phone: row.phone,
    relationship: row.relationship,
    hasKeys: row.hasKeys,
    sortOrder: row.sortOrder,
  };
}

function rescueView(
  profile: repo.ProfileRow,
  medicines: readonly repo.MedicineRow[],
  contacts: readonly repo.ContactRow[],
): RescueCard {
  return {
    residentId: profile.residentId,
    familyId: profile.familyId,
    bloodGroup: profile.bloodGroup,
    mobility: profile.mobility,
    allergies: phrases(profile.allergies),
    conditions: phrases(profile.conditions),
    devices: phrases(profile.medicalDevices),
    medicines: medicines.map(medicineView),
    contacts: contacts.map(contactView),
    version: profile.version,
    updatedAt: profile.updatedAt.toISOString(),
  };
}

function petView(row: repo.PetRow, houseIds: readonly string[]): Pet {
  return {
    id: row.id,
    familyId: row.familyId,
    name: row.name,
    species: row.species,
    breed: row.breed,
    notes: row.notes,
    vetName: row.vetName,
    vetPhone: row.vetPhone,
    vetAddress: row.vetAddress,
    houseIds: [...houseIds],
    planLocked: row.planLockedAt !== null,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function phoneView(row: repo.PhoneLineRow): PhoneLine {
  return {
    id: row.id,
    familyId: row.familyId,
    residentId: row.residentId,
    operatorName: row.operatorName,
    phoneNumber: row.phoneNumber,
    planName: row.planName,
    monthlyCost: money(row.monthlyCostMinor, row.currency),
    renewalDate: row.renewalDate,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function subscriptionView(row: repo.SubscriptionRow): PersonalSubscription {
  return {
    id: row.id,
    familyId: row.familyId,
    residentId: row.residentId,
    name: row.name,
    providerName: row.providerName,
    renewalDate: row.renewalDate,
    cost: money(row.costMinor, row.currency),
    notes: row.notes,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function vehicleView(row: repo.VehicleRow): Vehicle {
  return {
    id: row.id,
    familyId: row.familyId,
    residentId: row.residentId,
    plate: row.plate,
    make: row.make,
    model: row.model,
    insuranceRenewalDate: row.insuranceRenewalDate,
    roadTaxDueDate: row.roadTaxDueDate,
    inspectionDueDate: row.inspectionDueDate,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function bankView(row: repo.BankAccountRow): PersonalBankAccount {
  return {
    id: row.id,
    familyId: row.familyId,
    residentId: row.residentId,
    institution: row.institution,
    label: row.label,
    referenceHint: row.referenceHint,
    notes: row.notes,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function taxView(row: repo.TaxItemRow): TaxChecklistItem {
  return {
    id: row.id,
    familyId: row.familyId,
    residentId: row.residentId,
    taxYear: row.taxYear,
    itemKey: row.itemKey,
    dueDate: row.dueDate,
    status: row.status,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Personale use cases: residents, the readable rescue card, pets, personal services,
 * bank-account metadata and the annual tax checklist.
 *
 * @param db - Database bound to the `domusafe_app` pool.
 * @returns The service.
 */
export function createPersonaleService(db: Database) {
  async function inFamily<T>(tenant: TenantContext, work: (tx: Transaction) => Promise<T>): Promise<T> {
    return withContext(db, { principal: account(tenant.accountId), familyId: tenant.familyId }, work);
  }

  async function trace(
    tx: Transaction,
    tenant: TenantContext,
    input: {
      readonly action: string;
      readonly resourceType: string;
      readonly resourceId: string;
      readonly version: number;
      readonly op: 'create' | 'update' | 'delete';
      readonly data: Record<string, unknown>;
      readonly residentId?: string | null;
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
      residentId: input.residentId ?? null,
    });
    await recordAudit(tx, {
      familyId: tenant.familyId,
      actor,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      outcome: 'success',
    });
  }

  async function assertHouses(tx: Transaction, familyId: string, houseIds: readonly string[]): Promise<void> {
    for (const houseId of houseIds) {
      if ((await repo.findHouse(tx, familyId, houseId)) === null) {
        throw new ProblemError('validation_failed', { detail: 'A house does not belong to this family' });
      }
    }
  }

  async function requireResident(
    tx: Transaction,
    tenant: TenantContext,
    residentId: string,
  ): Promise<repo.ResidentRow> {
    const row = await repo.findResident(tx, tenant.familyId, residentId);
    if (row === null || (tenant.scope === 'own' && row.accountId !== tenant.accountId)) {
      throw new ProblemError('not_found');
    }
    return row;
  }

  function assertUnlocked(row: { readonly planLockedAt: Date | null }): void {
    if (row.planLockedAt !== null) {
      throw new ProblemError('plan_locked');
    }
  }

  async function residentOf(tx: Transaction, row: repo.ResidentRow): Promise<Resident> {
    const houses = await repo.housesOfResidents(tx, row.familyId, [row.id]);
    return residentView(row, houses.get(row.id) ?? []);
  }

  async function loadRescue(tx: Transaction, familyId: string, residentId: string): Promise<RescueCard> {
    const profile = await repo.findProfile(tx, familyId, residentId);
    if (profile === null) {
      throw new ProblemError('not_found');
    }
    const medicines = await repo.listMedicines(tx, familyId, [residentId]);
    const contacts = await repo.listContacts(tx, familyId, [residentId]);
    return rescueView(profile, medicines, contacts);
  }

  return {
    /**
     * Lists residents the caller can see.
     *
     * @param tenant - Resolved tenant.
     * @param query - Page and optional house.
     * @returns One page.
     */
    async listResidents(
      tenant: TenantContext,
      query: {
        readonly limit: number;
        readonly after: readonly [number, string] | null;
        readonly houseId?: string;
      },
    ): Promise<Page<Resident>> {
      return inFamily(tenant, async (tx) => {
        if (query.houseId !== undefined) {
          await assertHouses(tx, tenant.familyId, [query.houseId]);
        }
        const rows = await repo.listResidents(tx, {
          familyId: tenant.familyId,
          limit: query.limit,
          after: query.after,
          ...(query.houseId === undefined ? {} : { houseId: query.houseId }),
        });
        const visible =
          tenant.scope === 'own' ? rows.filter((row) => row.accountId === tenant.accountId) : rows;
        const houses = await repo.housesOfResidents(
          tx,
          tenant.familyId,
          visible.map((row) => row.id),
        );
        return pageOf(
          visible.map((row) => residentView(row, houses.get(row.id) ?? [])),
          query.limit,
          (row) => {
            const source = visible.find((item) => item.id === row.id);
            return [source?.sortOrder ?? 0, row.id] as const;
          },
        );
      });
    },

    /**
     * Creates a resident inside the plan limit and attaches an empty rescue card.
     *
     * @param tenant - Resolved tenant.
     * @param input - Identity and houses.
     * @returns The resident.
     */
    async createResident(tenant: TenantContext, input: CreateResidentRequest): Promise<Resident> {
      const houseIds = [...new Set(input.houseIds)];
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          if (!(await repo.lockFamily(tx, tenant.familyId))) {
            throw new ProblemError('not_found');
          }
          const usage = await repo.countActiveResidents(tx, tenant.familyId);
          const limit = checkLimit(tenant.plan.tier, 'residents', usage);
          if (!limit.allowed) {
            throw new ProblemError('plan_limit_reached', {
              usage,
              ...(limit.limit === null ? {} : { limit: limit.limit }),
            });
          }
          await assertHouses(tx, tenant.familyId, houseIds);
          const row = await repo.insertResident(tx, {
            familyId: tenant.familyId,
            displayName: input.displayName,
            kind: input.kind,
            birthYear: input.birthYear ?? null,
            usualBedroom: input.usualBedroom ?? null,
            photo: input.photo ?? null,
            sortOrder: usage,
            houseIds,
            createdBy: tenant.accountId,
            ...(input.color === undefined ? {} : { color: input.color }),
          });
          await trace(tx, tenant, {
            action: 'personale.resident.created',
            resourceType: 'residents',
            resourceId: row.id,
            version: row.version,
            op: 'create',
            residentId: row.id,
            data: { displayName: row.displayName, kind: row.kind, houseIds },
          });
          return residentView(row, houseIds);
        }),
      );
    },

    /**
     * Reads one resident.
     *
     * @param tenant - Resolved tenant.
     * @param residentId - Resident id.
     * @returns The resident.
     */
    async getResident(tenant: TenantContext, residentId: string): Promise<Resident> {
      return inFamily(tenant, async (tx) => residentOf(tx, await requireResident(tx, tenant, residentId)));
    },

    /**
     * Updates the identity of a resident.
     *
     * @param tenant - Resolved tenant.
     * @param residentId - Resident id.
     * @param expectedVersion - Version from `If-Match`.
     * @param patch - Fields to change.
     * @returns The resident.
     */
    async updateResident(
      tenant: TenantContext,
      residentId: string,
      expectedVersion: number,
      patch: UpdateResidentRequest,
    ): Promise<Resident> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          const current = await requireResident(tx, tenant, residentId);
          assertUnlocked(current);
          const updated = await repo.updateResident(
            tx,
            { familyId: tenant.familyId, residentId, expectedVersion },
            {
              ...(patch.displayName === undefined ? {} : { displayName: patch.displayName }),
              ...(patch.kind === undefined ? {} : { kind: patch.kind }),
              ...(patch.birthYear === undefined ? {} : { birthYear: patch.birthYear }),
              ...(patch.usualBedroom === undefined ? {} : { usualBedroom: patch.usualBedroom }),
              ...(patch.photo === undefined ? {} : { photo: patch.photo }),
              ...(patch.color === undefined ? {} : { color: patch.color }),
              updatedBy: tenant.accountId,
            },
          );
          if (updated === null) {
            conflict(current.version);
          }
          await trace(tx, tenant, {
            action: 'personale.resident.updated',
            resourceType: 'residents',
            resourceId: residentId,
            version: updated.version,
            op: 'update',
            residentId,
            data: { displayName: updated.displayName, kind: updated.kind, hasPhoto: updated.photo !== null },
          });
          return residentOf(tx, updated);
        }),
      );
    },

    /**
     * Replaces the houses a resident lives in.
     *
     * @param tenant - Resolved tenant.
     * @param residentId - Resident id.
     * @param expectedVersion - Version from `If-Match`.
     * @param input - The full set of houses.
     * @returns The resident.
     */
    async replaceHouses(
      tenant: TenantContext,
      residentId: string,
      expectedVersion: number,
      input: ReplaceResidentHousesRequest,
    ): Promise<Resident> {
      const houseIds = [...new Set(input.houseIds)];
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          const current = await requireResident(tx, tenant, residentId);
          assertUnlocked(current);
          await assertHouses(tx, tenant.familyId, houseIds);
          const updated = await repo.replaceResidentHouses(tx, {
            familyId: tenant.familyId,
            residentId,
            expectedVersion,
            houseIds,
            updatedBy: tenant.accountId,
          });
          if (updated === null) {
            conflict(current.version);
          }
          await trace(tx, tenant, {
            action: 'personale.resident.updated',
            resourceType: 'residents',
            resourceId: residentId,
            version: updated.version,
            op: 'update',
            residentId,
            data: { houseIds },
          });
          return residentView(updated, houseIds);
        }),
      );
    },

    /**
     * Moves a resident to the trash.
     *
     * @param tenant - Resolved tenant.
     * @param residentId - Resident id.
     * @param expectedVersion - Version from `If-Match`.
     */
    async deleteResident(tenant: TenantContext, residentId: string, expectedVersion: number): Promise<void> {
      await guarded(() =>
        inFamily(tenant, async (tx) => {
          const current = await requireResident(tx, tenant, residentId);
          assertUnlocked(current);
          const deleted = await repo.deleteResident(tx, {
            familyId: tenant.familyId,
            residentId,
            expectedVersion,
            updatedBy: tenant.accountId,
          });
          if (deleted === null) {
            conflict(current.version);
          }
          await trace(tx, tenant, {
            action: 'personale.resident.deleted',
            resourceType: 'residents',
            resourceId: residentId,
            version: deleted.version,
            op: 'delete',
            residentId,
            data: { displayName: deleted.displayName },
          });
        }),
      );
    },

    /**
     * Reads the rescue card. Callers with an own-data scope only receive their linked resident.
     *
     * @param tenant - Resolved tenant.
     * @param residentId - Resident id.
     * @returns The card.
     */
    async getRescue(tenant: TenantContext, residentId: string): Promise<RescueCard> {
      return inFamily(tenant, async (tx) => {
        await requireResident(tx, tenant, residentId);
        return loadRescue(tx, tenant.familyId, residentId);
      });
    },

    /**
     * Replaces the rescue card, including medicines and the ordered contacts.
     *
     * @param tenant - Resolved tenant.
     * @param residentId - Resident id.
     * @param expectedVersion - Profile version from `If-Match`.
     * @param input - The whole card.
     * @returns The stored card.
     */
    async putRescue(
      tenant: TenantContext,
      residentId: string,
      expectedVersion: number,
      input: PutRescueRequest,
    ): Promise<RescueCard> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          const resident = await requireResident(tx, tenant, residentId);
          assertUnlocked(resident);
          const profile = await repo.updateProfile(
            tx,
            { familyId: tenant.familyId, residentId, expectedVersion },
            {
              bloodGroup: input.bloodGroup,
              mobility: input.mobility,
              allergies: input.allergies,
              conditions: input.conditions,
              devices: input.devices,
              updatedBy: tenant.accountId,
            },
          );
          if (profile === null) {
            const current = await repo.findProfile(tx, tenant.familyId, residentId);
            conflict(current?.version ?? 0);
          }
          const medicines = await repo.replaceMedicines(tx, tenant.familyId, residentId, input.medicines);
          const contacts = await repo.replaceContacts(tx, tenant.familyId, residentId, input.contacts);
          await trace(tx, tenant, {
            action: 'personale.rescue.updated',
            resourceType: 'resident_profiles',
            resourceId: residentId,
            version: profile.version,
            op: 'update',
            residentId,
            data: {
              bloodGroup: profile.bloodGroup,
              mobility: profile.mobility,
              allergyCount: input.allergies.length,
              medicineCount: medicines.length,
              contactCount: contacts.length,
            },
          });
          return rescueView(profile, medicines, contacts);
        }),
      );
    },

    /**
     * Readable rescue sheet of one house: people linked to it, and the animals that live there.
     *
     * @param tenant - Resolved tenant.
     * @param houseId - House id.
     * @returns Names, medical facts, contacts and pets. No account numbers.
     */
    async getRescueSheet(tenant: TenantContext, houseId: string): Promise<RescueSheet> {
      return inFamily(tenant, async (tx) => {
        await assertHouses(tx, tenant.familyId, [houseId]);
        const people = await repo.listResidentsOfHouse(tx, tenant.familyId, houseId);
        const visible =
          tenant.scope === 'own' ? people.filter((row) => row.accountId === tenant.accountId) : people;
        const ids = visible.map((row) => row.id);
        const profiles = await repo.listProfiles(tx, tenant.familyId, ids);
        const medicines = await repo.listMedicines(tx, tenant.familyId, ids);
        const contacts = await repo.listContacts(tx, tenant.familyId, ids);
        const animals = await repo.listPets(tx, {
          familyId: tenant.familyId,
          houseId,
          limit: 200,
          after: null,
        });
        const profileById = new Map(profiles.map((row) => [row.residentId, row]));
        return {
          houseId,
          residents: visible.map((row) => {
            const profile = profileById.get(row.id);
            return {
              id: row.id,
              displayName: row.displayName,
              birthYear: row.birthYear,
              usualBedroom: row.usualBedroom,
              photo: row.photo,
              bloodGroup: profile?.bloodGroup ?? null,
              mobility: profile?.mobility ?? null,
              allergies: phrases(profile?.allergies ?? []),
              conditions: phrases(profile?.conditions ?? []),
              devices: phrases(profile?.medicalDevices ?? []),
              medicines: medicines.filter((item) => item.residentId === row.id).map(medicineView),
              contacts: contacts.filter((item) => item.residentId === row.id).map(contactView),
            };
          }),
          pets: animals.slice(0, 200).map((row) => ({
            id: row.id,
            name: row.name,
            species: row.species,
            vetName: row.vetName,
            vetPhone: row.vetPhone,
            vetAddress: row.vetAddress,
          })),
        };
      });
    },

    /**
     * Lists pets.
     *
     * @param tenant - Resolved tenant.
     * @param query - Page and optional house.
     * @returns One page.
     */
    async listPets(
      tenant: TenantContext,
      query: {
        readonly limit: number;
        readonly after: readonly [string, string] | null;
        readonly houseId?: string;
      },
    ): Promise<Page<Pet>> {
      return inFamily(tenant, async (tx) => {
        if (query.houseId !== undefined) {
          await assertHouses(tx, tenant.familyId, [query.houseId]);
        }
        const rows = await repo.listPets(tx, {
          familyId: tenant.familyId,
          limit: query.limit,
          after: query.after,
          ...(query.houseId === undefined ? {} : { houseId: query.houseId }),
        });
        const links = await repo.housesOfPets(
          tx,
          tenant.familyId,
          rows.map((row) => row.id),
        );
        return pageOf(
          rows.map((row) => petView(row, links.get(row.id) ?? [])),
          query.limit,
          (row) => [
            rows.find((item) => item.id === row.id)?.createdAt.toISOString() ?? row.createdAt,
            row.id,
          ],
        );
      });
    },

    /**
     * Creates a pet inside the plan limit.
     *
     * @param tenant - Resolved tenant.
     * @param input - Name, species, clinic and houses.
     * @returns The pet.
     */
    async createPet(tenant: TenantContext, input: CreatePetRequest): Promise<Pet> {
      const houseIds = [...new Set(input.houseIds)];
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          if (!(await repo.lockFamily(tx, tenant.familyId))) {
            throw new ProblemError('not_found');
          }
          const usage = await repo.countActivePets(tx, tenant.familyId);
          const limit = checkLimit(tenant.plan.tier, 'pets', usage);
          if (!limit.allowed) {
            throw new ProblemError('plan_limit_reached', {
              usage,
              ...(limit.limit === null ? {} : { limit: limit.limit }),
            });
          }
          await assertHouses(tx, tenant.familyId, houseIds);
          const row = await repo.insertPet(tx, {
            familyId: tenant.familyId,
            name: input.name,
            species: input.species,
            breed: input.breed ?? null,
            notes: input.notes ?? null,
            vetName: input.vetName ?? null,
            vetPhone: input.vetPhone ?? null,
            vetAddress: input.vetAddress ?? null,
            houseIds,
            createdBy: tenant.accountId,
          });
          await trace(tx, tenant, {
            action: 'personale.pet.created',
            resourceType: 'pets',
            resourceId: row.id,
            version: row.version,
            op: 'create',
            data: { name: row.name, species: row.species },
          });
          return petView(row, houseIds);
        }),
      );
    },

    /**
     * Updates a pet.
     *
     * @param tenant - Resolved tenant.
     * @param petId - Pet id.
     * @param expectedVersion - Version from `If-Match`.
     * @param patch - Fields to change.
     * @returns The pet.
     */
    async updatePet(
      tenant: TenantContext,
      petId: string,
      expectedVersion: number,
      patch: UpdatePetRequest,
    ): Promise<Pet> {
      const houseIds = patch.houseIds === undefined ? undefined : [...new Set(patch.houseIds)];
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          const current = await repo.findPet(tx, tenant.familyId, petId);
          if (current === null) {
            throw new ProblemError('not_found');
          }
          assertUnlocked(current);
          if (houseIds !== undefined) {
            await assertHouses(tx, tenant.familyId, houseIds);
          }
          const updated = await repo.updatePet(
            tx,
            { familyId: tenant.familyId, petId, expectedVersion },
            {
              ...(patch.name === undefined ? {} : { name: patch.name }),
              ...(patch.species === undefined ? {} : { species: patch.species }),
              ...(patch.breed === undefined ? {} : { breed: patch.breed }),
              ...(patch.notes === undefined ? {} : { notes: patch.notes }),
              ...(patch.vetName === undefined ? {} : { vetName: patch.vetName }),
              ...(patch.vetPhone === undefined ? {} : { vetPhone: patch.vetPhone }),
              ...(patch.vetAddress === undefined ? {} : { vetAddress: patch.vetAddress }),
              ...(houseIds === undefined ? {} : { houseIds }),
              updatedBy: tenant.accountId,
            },
          );
          if (updated === null) {
            conflict(current.version);
          }
          await trace(tx, tenant, {
            action: 'personale.pet.updated',
            resourceType: 'pets',
            resourceId: petId,
            version: updated.version,
            op: 'update',
            data: { name: updated.name, species: updated.species },
          });
          const links = await repo.housesOfPets(tx, tenant.familyId, [petId]);
          return petView(updated, links.get(petId) ?? []);
        }),
      );
    },

    /**
     * Moves a pet to the trash.
     *
     * @param tenant - Resolved tenant.
     * @param petId - Pet id.
     * @param expectedVersion - Version from `If-Match`.
     */
    async deletePet(tenant: TenantContext, petId: string, expectedVersion: number): Promise<void> {
      await guarded(() =>
        inFamily(tenant, async (tx) => {
          const current = await repo.findPet(tx, tenant.familyId, petId);
          if (current === null) {
            throw new ProblemError('not_found');
          }
          assertUnlocked(current);
          const deleted = await repo.deletePet(tx, {
            familyId: tenant.familyId,
            petId,
            expectedVersion,
            updatedBy: tenant.accountId,
          });
          if (deleted === null) {
            conflict(current.version);
          }
          await trace(tx, tenant, {
            action: 'personale.pet.deleted',
            resourceType: 'pets',
            resourceId: petId,
            version: deleted.version,
            op: 'delete',
            data: { name: deleted.name },
          });
        }),
      );
    },

    /**
     * Lists mobile plans of a resident.
     *
     * @param tenant - Resolved tenant.
     * @param residentId - Resident id.
     * @param page - Keyset.
     * @returns One page.
     */
    async listPhoneLines(
      tenant: TenantContext,
      residentId: string,
      page: { readonly limit: number; readonly after: readonly [string, string] | null },
    ): Promise<Page<PhoneLine>> {
      return inFamily(tenant, async (tx) => {
        await requireResident(tx, tenant, residentId);
        const rows = await repo.listPhoneLines(tx, { familyId: tenant.familyId, residentId, ...page });
        return pageOf(rows.map(phoneView), page.limit, (row) => [row.createdAt, row.id]);
      });
    },

    /**
     * Adds a mobile plan. Secrets of the SIM are not accepted.
     *
     * @param tenant - Resolved tenant.
     * @param residentId - Resident id.
     * @param input - Operator, number and plan.
     * @returns The plan.
     */
    async createPhoneLine(
      tenant: TenantContext,
      residentId: string,
      input: CreatePhoneLineRequest,
    ): Promise<PhoneLine> {
      const cost = costColumns(input.monthlyCost ?? null);
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          const resident = await requireResident(tx, tenant, residentId);
          assertUnlocked(resident);
          const row = await repo.insertPhoneLine(tx, {
            familyId: tenant.familyId,
            residentId,
            operatorName: input.operatorName,
            phoneNumber: input.phoneNumber,
            planName: input.planName,
            monthlyCostMinor: cost?.minor ?? null,
            currency: cost?.currency ?? null,
            renewalDate: input.renewalDate ?? null,
            createdBy: tenant.accountId,
          });
          await trace(tx, tenant, {
            action: 'personale.phone_line.created',
            resourceType: 'phone_lines',
            resourceId: row.id,
            version: row.version,
            op: 'create',
            residentId,
            data: { operatorName: row.operatorName, planName: row.planName },
          });
          return phoneView(row);
        }),
      );
    },

    /**
     * Updates a mobile plan.
     *
     * @param tenant - Resolved tenant.
     * @param residentId - Resident id.
     * @param phoneLineId - Plan id.
     * @param expectedVersion - Version from `If-Match`.
     * @param patch - Fields to change.
     * @returns The plan.
     */
    async updatePhoneLine(
      tenant: TenantContext,
      residentId: string,
      phoneLineId: string,
      expectedVersion: number,
      patch: UpdatePhoneLineRequest,
    ): Promise<PhoneLine> {
      const cost = costColumns(patch.monthlyCost);
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          const resident = await requireResident(tx, tenant, residentId);
          assertUnlocked(resident);
          const current = await repo.findPhoneLine(tx, {
            familyId: tenant.familyId,
            residentId,
            phoneLineId,
          });
          if (current === null) {
            throw new ProblemError('not_found');
          }
          const updated = await repo.updatePhoneLine(
            tx,
            { familyId: tenant.familyId, residentId, phoneLineId, expectedVersion },
            {
              ...(patch.operatorName === undefined ? {} : { operatorName: patch.operatorName }),
              ...(patch.phoneNumber === undefined ? {} : { phoneNumber: patch.phoneNumber }),
              ...(patch.planName === undefined ? {} : { planName: patch.planName }),
              ...(cost === undefined ? {} : { monthlyCostMinor: cost.minor, currency: cost.currency }),
              ...(patch.renewalDate === undefined ? {} : { renewalDate: patch.renewalDate }),
              updatedBy: tenant.accountId,
            },
          );
          if (updated === null) {
            conflict(current.version);
          }
          await trace(tx, tenant, {
            action: 'personale.phone_line.updated',
            resourceType: 'phone_lines',
            resourceId: phoneLineId,
            version: updated.version,
            op: 'update',
            residentId,
            data: { operatorName: updated.operatorName, planName: updated.planName },
          });
          return phoneView(updated);
        }),
      );
    },

    /**
     * Moves a mobile plan to the trash.
     *
     * @param tenant - Resolved tenant.
     * @param residentId - Resident id.
     * @param phoneLineId - Plan id.
     * @param expectedVersion - Version from `If-Match`.
     */
    async deletePhoneLine(
      tenant: TenantContext,
      residentId: string,
      phoneLineId: string,
      expectedVersion: number,
    ): Promise<void> {
      await guarded(() =>
        inFamily(tenant, async (tx) => {
          const resident = await requireResident(tx, tenant, residentId);
          assertUnlocked(resident);
          const current = await repo.findPhoneLine(tx, {
            familyId: tenant.familyId,
            residentId,
            phoneLineId,
          });
          if (current === null) {
            throw new ProblemError('not_found');
          }
          const deleted = await repo.deletePhoneLine(tx, {
            familyId: tenant.familyId,
            residentId,
            phoneLineId,
            expectedVersion,
            updatedBy: tenant.accountId,
          });
          if (deleted === null) {
            conflict(current.version);
          }
          await trace(tx, tenant, {
            action: 'personale.phone_line.deleted',
            resourceType: 'phone_lines',
            resourceId: phoneLineId,
            version: deleted.version,
            op: 'delete',
            residentId,
            data: {},
          });
        }),
      );
    },

    /**
     * Lists personal subscriptions of a resident.
     *
     * @param tenant - Resolved tenant.
     * @param residentId - Resident id.
     * @param page - Keyset.
     * @returns One page.
     */
    async listSubscriptions(
      tenant: TenantContext,
      residentId: string,
      page: { readonly limit: number; readonly after: readonly [string, string] | null },
    ): Promise<Page<PersonalSubscription>> {
      return inFamily(tenant, async (tx) => {
        await requireResident(tx, tenant, residentId);
        const rows = await repo.listSubscriptions(tx, { familyId: tenant.familyId, residentId, ...page });
        return pageOf(rows.map(subscriptionView), page.limit, (row) => [row.createdAt, row.id]);
      });
    },

    /**
     * Adds a personal subscription.
     *
     * @param tenant - Resolved tenant.
     * @param residentId - Resident id.
     * @param input - Name and renewal.
     * @returns The subscription.
     */
    async createSubscription(
      tenant: TenantContext,
      residentId: string,
      input: CreatePersonalSubscriptionRequest,
    ): Promise<PersonalSubscription> {
      const cost = costColumns(input.cost ?? null);
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          const resident = await requireResident(tx, tenant, residentId);
          assertUnlocked(resident);
          const row = await repo.insertSubscription(tx, {
            familyId: tenant.familyId,
            residentId,
            name: input.name,
            providerName: input.providerName ?? null,
            renewalDate: input.renewalDate ?? null,
            costMinor: cost?.minor ?? null,
            currency: cost?.currency ?? null,
            notes: input.notes ?? null,
            createdBy: tenant.accountId,
          });
          await trace(tx, tenant, {
            action: 'personale.subscription.created',
            resourceType: 'subscriptions',
            resourceId: row.id,
            version: row.version,
            op: 'create',
            residentId,
            data: { name: row.name },
          });
          return subscriptionView(row);
        }),
      );
    },

    /**
     * Updates a personal subscription.
     *
     * @param tenant - Resolved tenant.
     * @param residentId - Resident id.
     * @param subscriptionId - Subscription id.
     * @param expectedVersion - Version from `If-Match`.
     * @param patch - Fields to change.
     * @returns The subscription.
     */
    async updateSubscription(
      tenant: TenantContext,
      residentId: string,
      subscriptionId: string,
      expectedVersion: number,
      patch: UpdatePersonalSubscriptionRequest,
    ): Promise<PersonalSubscription> {
      const cost = costColumns(patch.cost);
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          const resident = await requireResident(tx, tenant, residentId);
          assertUnlocked(resident);
          const current = await repo.findSubscription(tx, {
            familyId: tenant.familyId,
            residentId,
            subscriptionId,
          });
          if (current === null) {
            throw new ProblemError('not_found');
          }
          const updated = await repo.updateSubscription(
            tx,
            { familyId: tenant.familyId, residentId, subscriptionId, expectedVersion },
            {
              ...(patch.name === undefined ? {} : { name: patch.name }),
              ...(patch.providerName === undefined ? {} : { providerName: patch.providerName }),
              ...(patch.renewalDate === undefined ? {} : { renewalDate: patch.renewalDate }),
              ...(cost === undefined ? {} : { costMinor: cost.minor, currency: cost.currency }),
              ...(patch.notes === undefined ? {} : { notes: patch.notes }),
              updatedBy: tenant.accountId,
            },
          );
          if (updated === null) {
            conflict(current.version);
          }
          await trace(tx, tenant, {
            action: 'personale.subscription.updated',
            resourceType: 'subscriptions',
            resourceId: subscriptionId,
            version: updated.version,
            op: 'update',
            residentId,
            data: { name: updated.name },
          });
          return subscriptionView(updated);
        }),
      );
    },

    /**
     * Moves a personal subscription to the trash.
     *
     * @param tenant - Resolved tenant.
     * @param residentId - Resident id.
     * @param subscriptionId - Subscription id.
     * @param expectedVersion - Version from `If-Match`.
     */
    async deleteSubscription(
      tenant: TenantContext,
      residentId: string,
      subscriptionId: string,
      expectedVersion: number,
    ): Promise<void> {
      await guarded(() =>
        inFamily(tenant, async (tx) => {
          const resident = await requireResident(tx, tenant, residentId);
          assertUnlocked(resident);
          const current = await repo.findSubscription(tx, {
            familyId: tenant.familyId,
            residentId,
            subscriptionId,
          });
          if (current === null) {
            throw new ProblemError('not_found');
          }
          const deleted = await repo.deleteSubscription(tx, {
            familyId: tenant.familyId,
            subscriptionId,
            expectedVersion,
            updatedBy: tenant.accountId,
          });
          if (deleted === null) {
            conflict(current.version);
          }
          await trace(tx, tenant, {
            action: 'personale.subscription.deleted',
            resourceType: 'subscriptions',
            resourceId: subscriptionId,
            version: deleted.version,
            op: 'delete',
            residentId,
            data: {},
          });
        }),
      );
    },

    /**
     * Lists vehicles of a resident.
     *
     * @param tenant - Resolved tenant.
     * @param residentId - Resident id.
     * @param page - Keyset.
     * @returns One page.
     */
    async listVehicles(
      tenant: TenantContext,
      residentId: string,
      page: { readonly limit: number; readonly after: readonly [string, string] | null },
    ): Promise<Page<Vehicle>> {
      return inFamily(tenant, async (tx) => {
        await requireResident(tx, tenant, residentId);
        const rows = await repo.listVehicles(tx, { familyId: tenant.familyId, residentId, ...page });
        return pageOf(rows.map(vehicleView), page.limit, (row) => [row.createdAt, row.id]);
      });
    },

    /**
     * Adds a vehicle and its three deadlines.
     *
     * @param tenant - Resolved tenant.
     * @param residentId - Resident id.
     * @param input - Plate and dates.
     * @returns The vehicle.
     */
    async createVehicle(
      tenant: TenantContext,
      residentId: string,
      input: CreateVehicleRequest,
    ): Promise<Vehicle> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          const resident = await requireResident(tx, tenant, residentId);
          assertUnlocked(resident);
          const row = await repo.insertVehicle(tx, {
            familyId: tenant.familyId,
            residentId,
            plate: input.plate,
            make: input.make ?? null,
            model: input.model ?? null,
            insuranceRenewalDate: input.insuranceRenewalDate ?? null,
            roadTaxDueDate: input.roadTaxDueDate ?? null,
            inspectionDueDate: input.inspectionDueDate ?? null,
            createdBy: tenant.accountId,
          });
          await trace(tx, tenant, {
            action: 'personale.vehicle.created',
            resourceType: 'vehicles',
            resourceId: row.id,
            version: row.version,
            op: 'create',
            residentId,
            data: { plate: row.plate },
          });
          return vehicleView(row);
        }),
      );
    },

    /**
     * Updates a vehicle.
     *
     * @param tenant - Resolved tenant.
     * @param residentId - Resident id.
     * @param vehicleId - Vehicle id.
     * @param expectedVersion - Version from `If-Match`.
     * @param patch - Fields to change.
     * @returns The vehicle.
     */
    async updateVehicle(
      tenant: TenantContext,
      residentId: string,
      vehicleId: string,
      expectedVersion: number,
      patch: UpdateVehicleRequest,
    ): Promise<Vehicle> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          const resident = await requireResident(tx, tenant, residentId);
          assertUnlocked(resident);
          const current = await repo.findVehicle(tx, { familyId: tenant.familyId, residentId, vehicleId });
          if (current === null) {
            throw new ProblemError('not_found');
          }
          const updated = await repo.updateVehicle(
            tx,
            { familyId: tenant.familyId, residentId, vehicleId, expectedVersion },
            {
              ...(patch.plate === undefined ? {} : { plate: patch.plate }),
              ...(patch.make === undefined ? {} : { make: patch.make }),
              ...(patch.model === undefined ? {} : { model: patch.model }),
              ...(patch.insuranceRenewalDate === undefined
                ? {}
                : { insuranceRenewalDate: patch.insuranceRenewalDate }),
              ...(patch.roadTaxDueDate === undefined ? {} : { roadTaxDueDate: patch.roadTaxDueDate }),
              ...(patch.inspectionDueDate === undefined
                ? {}
                : { inspectionDueDate: patch.inspectionDueDate }),
              updatedBy: tenant.accountId,
            },
          );
          if (updated === null) {
            conflict(current.version);
          }
          await trace(tx, tenant, {
            action: 'personale.vehicle.updated',
            resourceType: 'vehicles',
            resourceId: vehicleId,
            version: updated.version,
            op: 'update',
            residentId,
            data: { plate: updated.plate },
          });
          return vehicleView(updated);
        }),
      );
    },

    /**
     * Moves a vehicle to the trash.
     *
     * @param tenant - Resolved tenant.
     * @param residentId - Resident id.
     * @param vehicleId - Vehicle id.
     * @param expectedVersion - Version from `If-Match`.
     */
    async deleteVehicle(
      tenant: TenantContext,
      residentId: string,
      vehicleId: string,
      expectedVersion: number,
    ): Promise<void> {
      await guarded(() =>
        inFamily(tenant, async (tx) => {
          const resident = await requireResident(tx, tenant, residentId);
          assertUnlocked(resident);
          const current = await repo.findVehicle(tx, { familyId: tenant.familyId, residentId, vehicleId });
          if (current === null) {
            throw new ProblemError('not_found');
          }
          const deleted = await repo.deleteVehicle(tx, {
            familyId: tenant.familyId,
            vehicleId,
            expectedVersion,
            updatedBy: tenant.accountId,
          });
          if (deleted === null) {
            conflict(current.version);
          }
          await trace(tx, tenant, {
            action: 'personale.vehicle.deleted',
            resourceType: 'vehicles',
            resourceId: vehicleId,
            version: deleted.version,
            op: 'delete',
            residentId,
            data: {},
          });
        }),
      );
    },

    /**
     * Lists personal bank-account metadata. The route is Premium.
     *
     * @param tenant - Resolved tenant.
     * @param residentId - Resident id.
     * @param page - Keyset.
     * @returns One page. No full account numbers.
     */
    async listBankAccounts(
      tenant: TenantContext,
      residentId: string,
      page: { readonly limit: number; readonly after: readonly [string, string] | null },
    ): Promise<Page<PersonalBankAccount>> {
      return inFamily(tenant, async (tx) => {
        await requireResident(tx, tenant, residentId);
        const rows = await repo.listBankAccounts(tx, { familyId: tenant.familyId, residentId, ...page });
        return pageOf(rows.map(bankView), page.limit, (row) => [row.createdAt, row.id]);
      });
    },

    /**
     * Stores metadata of a personal bank account. A full account number cannot be written.
     *
     * @param tenant - Resolved tenant.
     * @param residentId - Resident id.
     * @param input - Institution, label and optional trailing digits.
     * @returns The metadata.
     */
    async createBankAccount(
      tenant: TenantContext,
      residentId: string,
      input: CreatePersonalBankAccountRequest,
    ): Promise<PersonalBankAccount> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          const resident = await requireResident(tx, tenant, residentId);
          assertUnlocked(resident);
          const row = await repo.insertBankAccount(tx, {
            familyId: tenant.familyId,
            residentId,
            institution: input.institution,
            label: input.label,
            referenceHint: input.referenceHint ?? null,
            notes: input.notes ?? null,
            createdBy: tenant.accountId,
          });
          await trace(tx, tenant, {
            action: 'personale.bank_account.created',
            resourceType: 'personal_bank_accounts',
            resourceId: row.id,
            version: row.version,
            op: 'create',
            residentId,
            data: { institution: row.institution },
          });
          return bankView(row);
        }),
      );
    },

    /**
     * Updates bank-account metadata.
     *
     * @param tenant - Resolved tenant.
     * @param residentId - Resident id.
     * @param accountId - Account id.
     * @param expectedVersion - Version from `If-Match`.
     * @param patch - Fields to change.
     * @returns The metadata.
     */
    async updateBankAccount(
      tenant: TenantContext,
      residentId: string,
      accountId: string,
      expectedVersion: number,
      patch: UpdatePersonalBankAccountRequest,
    ): Promise<PersonalBankAccount> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          const resident = await requireResident(tx, tenant, residentId);
          assertUnlocked(resident);
          const current = await repo.findBankAccount(tx, {
            familyId: tenant.familyId,
            residentId,
            accountId,
          });
          if (current === null) {
            throw new ProblemError('not_found');
          }
          const updated = await repo.updateBankAccount(
            tx,
            { familyId: tenant.familyId, accountId, expectedVersion },
            {
              ...(patch.institution === undefined ? {} : { institution: patch.institution }),
              ...(patch.label === undefined ? {} : { label: patch.label }),
              ...(patch.referenceHint === undefined ? {} : { referenceHint: patch.referenceHint }),
              ...(patch.notes === undefined ? {} : { notes: patch.notes }),
              updatedBy: tenant.accountId,
            },
          );
          if (updated === null) {
            conflict(current.version);
          }
          await trace(tx, tenant, {
            action: 'personale.bank_account.updated',
            resourceType: 'personal_bank_accounts',
            resourceId: accountId,
            version: updated.version,
            op: 'update',
            residentId,
            data: { institution: updated.institution },
          });
          return bankView(updated);
        }),
      );
    },

    /**
     * Moves bank-account metadata to the trash.
     *
     * @param tenant - Resolved tenant.
     * @param residentId - Resident id.
     * @param accountId - Account id.
     * @param expectedVersion - Version from `If-Match`.
     */
    async deleteBankAccount(
      tenant: TenantContext,
      residentId: string,
      accountId: string,
      expectedVersion: number,
    ): Promise<void> {
      await guarded(() =>
        inFamily(tenant, async (tx) => {
          const resident = await requireResident(tx, tenant, residentId);
          assertUnlocked(resident);
          const current = await repo.findBankAccount(tx, {
            familyId: tenant.familyId,
            residentId,
            accountId,
          });
          if (current === null) {
            throw new ProblemError('not_found');
          }
          const deleted = await repo.deleteBankAccount(tx, {
            familyId: tenant.familyId,
            accountId,
            expectedVersion,
            updatedBy: tenant.accountId,
          });
          if (deleted === null) {
            conflict(current.version);
          }
          await trace(tx, tenant, {
            action: 'personale.bank_account.deleted',
            resourceType: 'personal_bank_accounts',
            resourceId: accountId,
            version: deleted.version,
            op: 'delete',
            residentId,
            data: {},
          });
        }),
      );
    },

    /**
     * Lists the tax checklist of a resident for one year. The route is Premium.
     *
     * @param tenant - Resolved tenant.
     * @param residentId - Resident id.
     * @param year - Calendar year.
     * @returns The items, which may still be empty.
     */
    async listTax(tenant: TenantContext, residentId: string, year: number): Promise<TaxChecklist> {
      return inFamily(tenant, async (tx) => {
        await requireResident(tx, tenant, residentId);
        const items = await repo.listTaxItems(tx, tenant.familyId, residentId, year);
        return { residentId, taxYear: year, items: items.map(taxView) };
      });
    },

    /**
     * Creates the standard Italian tax items that are missing for the year.
     *
     * @param tenant - Resolved tenant.
     * @param input - Resident and year.
     * @returns The full checklist of that year.
     */
    async generateTax(tenant: TenantContext, input: GenerateTaxChecklistRequest): Promise<TaxChecklist> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          const resident = await requireResident(tx, tenant, input.residentId);
          assertUnlocked(resident);
          const existing = await repo.listTaxItems(tx, tenant.familyId, input.residentId, input.year);
          const have = new Set(existing.map((item) => item.itemKey));
          const missing = TAX_ITEM_KEYS.filter((key) => !have.has(key));
          await repo.insertMissingTaxItems(tx, {
            familyId: tenant.familyId,
            residentId: input.residentId,
            taxYear: input.year,
            keys: missing,
            createdBy: tenant.accountId,
          });
          const items = await repo.listTaxItems(tx, tenant.familyId, input.residentId, input.year);
          if (missing.length > 0) {
            await trace(tx, tenant, {
              action: 'personale.tax_checklist.generated',
              resourceType: 'tax_checklist_items',
              resourceId: input.residentId,
              version: items.length,
              op: 'create',
              residentId: input.residentId,
              data: { taxYear: input.year, count: items.length },
            });
          }
          return { residentId: input.residentId, taxYear: input.year, items: items.map(taxView) };
        }),
      );
    },

    /**
     * Updates the status or the due date of one tax item.
     *
     * @param tenant - Resolved tenant.
     * @param itemId - Item id.
     * @param expectedVersion - Version from `If-Match`.
     * @param patch - Fields to change.
     * @returns The item.
     */
    async updateTaxItem(
      tenant: TenantContext,
      itemId: string,
      expectedVersion: number,
      patch: UpdateTaxChecklistItemRequest,
    ): Promise<TaxChecklistItem> {
      return guarded(() =>
        inFamily(tenant, async (tx) => {
          const current = await repo.findTaxItem(tx, tenant.familyId, itemId);
          if (current === null) {
            throw new ProblemError('not_found');
          }
          const resident = await requireResident(tx, tenant, current.residentId);
          assertUnlocked(resident);
          const updated = await repo.updateTaxItem(
            tx,
            { familyId: tenant.familyId, itemId, expectedVersion },
            {
              ...(patch.dueDate === undefined ? {} : { dueDate: patch.dueDate }),
              ...(patch.status === undefined ? {} : { status: patch.status }),
              updatedBy: tenant.accountId,
            },
          );
          if (updated === null) {
            conflict(current.version);
          }
          await trace(tx, tenant, {
            action: 'personale.tax_checklist.updated',
            resourceType: 'tax_checklist_items',
            resourceId: itemId,
            version: updated.version,
            op: 'update',
            residentId: updated.residentId,
            data: { itemKey: updated.itemKey, status: updated.status },
          });
          return taxView(updated);
        }),
      );
    },
  };
}

/** Personale service. */
export type PersonaleService = ReturnType<typeof createPersonaleService>;
