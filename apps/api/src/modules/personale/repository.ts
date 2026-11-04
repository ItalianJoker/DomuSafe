import {
  emergencyContacts,
  families,
  houses,
  lifesavingMedicines,
  personalBankAccounts,
  petHouses,
  pets,
  phoneLines,
  residentHouses,
  residentProfiles,
  residents,
  subscriptions,
  taxChecklistItems,
  vehicles,
  type Transaction,
} from '@domusafe/db';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';

/** Row of `residents`. */
export type ResidentRow = typeof residents.$inferSelect;
/** Row of `resident_profiles`. */
export type ProfileRow = typeof residentProfiles.$inferSelect;
/** Row of `lifesaving_medicines`. */
export type MedicineRow = typeof lifesavingMedicines.$inferSelect;
/** Row of `emergency_contacts`. */
export type ContactRow = typeof emergencyContacts.$inferSelect;
/** Row of `pets`. */
export type PetRow = typeof pets.$inferSelect;
/** Row of `phone_lines`. */
export type PhoneLineRow = typeof phoneLines.$inferSelect;
/** Row of `subscriptions`. */
export type SubscriptionRow = typeof subscriptions.$inferSelect;
/** Row of `vehicles`. */
export type VehicleRow = typeof vehicles.$inferSelect;
/** Row of `personal_bank_accounts`. */
export type BankAccountRow = typeof personalBankAccounts.$inferSelect;
/** Row of `tax_checklist_items`. */
export type TaxItemRow = typeof taxChecklistItems.$inferSelect;

interface ResidentPage {
  readonly familyId: string;
  readonly houseId?: string;
  readonly limit: number;
  readonly after: readonly [number, string] | null;
}

interface InstantPage {
  readonly familyId: string;
  readonly residentId?: string;
  readonly houseId?: string;
  readonly limit: number;
  readonly after: readonly [string, string] | null;
}

/**
 * Locks the family row so a plan-limit check cannot race another creation.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @returns False when the family is not visible.
 */
export async function lockFamily(tx: Transaction, familyId: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: families.id })
    .from(families)
    .where(eq(families.id, familyId))
    .for('update');
  return row !== undefined;
}

/**
 * Reads a non-deleted house of the family.
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
 * Counts residents that consume the plan limit.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @returns Active residents that are not locked by a downgrade.
 */
export async function countActiveResidents(tx: Transaction, familyId: string): Promise<number> {
  const [row] = await tx
    .select({ value: sql<number>`count(*)::int` })
    .from(residents)
    .where(
      and(eq(residents.familyId, familyId), isNull(residents.deletedAt), isNull(residents.planLockedAt)),
    );
  return row?.value ?? 0;
}

/**
 * Counts pets that consume the plan limit.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @returns Active pets that are not locked by a downgrade.
 */
export async function countActivePets(tx: Transaction, familyId: string): Promise<number> {
  const [row] = await tx
    .select({ value: sql<number>`count(*)::int` })
    .from(pets)
    .where(and(eq(pets.familyId, familyId), isNull(pets.deletedAt), isNull(pets.planLockedAt)));
  return row?.value ?? 0;
}

/**
 * House links of the given residents.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param residentIds - Resident ids. Empty skips the query.
 * @returns House ids keyed by resident id.
 */
export async function housesOfResidents(
  tx: Transaction,
  familyId: string,
  residentIds: readonly string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (residentIds.length === 0) {
    return map;
  }
  const rows = await tx
    .select({ residentId: residentHouses.residentId, houseId: residentHouses.houseId })
    .from(residentHouses)
    .where(and(eq(residentHouses.familyId, familyId), inArray(residentHouses.residentId, [...residentIds])));
  for (const row of rows) {
    map.set(row.residentId, [...(map.get(row.residentId) ?? []), row.houseId]);
  }
  return map;
}

/**
 * Inserts a resident and an empty rescue profile.
 *
 * @param tx - Transaction.
 * @param input - Identity columns and the houses to attach.
 * @returns The resident row.
 */
export async function insertResident(
  tx: Transaction,
  input: {
    readonly familyId: string;
    readonly displayName: string;
    readonly kind: ResidentRow['kind'];
    readonly birthYear: number | null;
    readonly usualBedroom: string | null;
    readonly photo: string | null;
    readonly color?: string;
    readonly sortOrder: number;
    readonly houseIds: readonly string[];
    readonly createdBy: string;
  },
): Promise<ResidentRow> {
  const [row] = await tx
    .insert(residents)
    .values({
      familyId: input.familyId,
      displayName: input.displayName,
      kind: input.kind,
      birthYear: input.birthYear,
      usualBedroom: input.usualBedroom,
      photo: input.photo,
      sortOrder: input.sortOrder,
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
      ...(input.color === undefined ? {} : { color: input.color }),
    })
    .returning();
  if (row === undefined) {
    throw new Error('Resident insert returned no row');
  }
  await tx.insert(residentProfiles).values({
    residentId: row.id,
    familyId: input.familyId,
    allergies: [],
    conditions: [],
    medicalDevices: [],
    createdBy: input.createdBy,
    updatedBy: input.createdBy,
  });
  if (input.houseIds.length > 0) {
    await tx
      .insert(residentHouses)
      .values(input.houseIds.map((houseId) => ({ familyId: input.familyId, residentId: row.id, houseId })));
  }
  return row;
}

/**
 * Lists non-deleted residents, optionally limited to one house.
 *
 * @param tx - Transaction.
 * @param page - Family, optional house and keyset.
 * @returns Up to `limit + 1` rows.
 */
export async function listResidents(tx: Transaction, page: ResidentPage): Promise<ResidentRow[]> {
  const after =
    page.after === null
      ? undefined
      : sql`(${residents.sortOrder}, ${residents.id}) > (${page.after[0]}, ${page.after[1]}::uuid)`;
  const house =
    page.houseId === undefined
      ? undefined
      : sql`${residents.id} in (
          select resident_id from resident_houses
          where family_id = ${page.familyId} and house_id = ${page.houseId}
        )`;
  return tx
    .select()
    .from(residents)
    .where(and(eq(residents.familyId, page.familyId), isNull(residents.deletedAt), house, after))
    .orderBy(asc(residents.sortOrder), asc(residents.id))
    .limit(page.limit + 1);
}

/**
 * Reads one non-deleted resident.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param residentId - Resident id.
 * @returns The row, or null.
 */
export async function findResident(
  tx: Transaction,
  familyId: string,
  residentId: string,
): Promise<ResidentRow | null> {
  const [row] = await tx
    .select()
    .from(residents)
    .where(and(eq(residents.familyId, familyId), eq(residents.id, residentId), isNull(residents.deletedAt)));
  return row ?? null;
}

/**
 * Updates identity fields when the version matches.
 *
 * @param tx - Transaction.
 * @param scope - Family, resident and expected version.
 * @param patch - Columns to write. Absent keys stay unchanged.
 * @returns The new row, or null on a version mismatch.
 */
export async function updateResident(
  tx: Transaction,
  scope: { readonly familyId: string; readonly residentId: string; readonly expectedVersion: number },
  patch: Partial<
    Pick<ResidentRow, 'displayName' | 'kind' | 'birthYear' | 'usualBedroom' | 'photo' | 'color' | 'updatedBy'>
  >,
): Promise<ResidentRow | null> {
  const [row] = await tx
    .update(residents)
    .set({ ...patch, version: sql`${residents.version} + 1` })
    .where(
      and(
        eq(residents.familyId, scope.familyId),
        eq(residents.id, scope.residentId),
        eq(residents.version, scope.expectedVersion),
        isNull(residents.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Replaces the houses of a resident and bumps the resident version.
 *
 * @param tx - Transaction.
 * @param scope - Family, resident, expected version and the new house ids.
 * @param updatedBy - Account id.
 * @returns The resident, or null on a version mismatch.
 */
export async function replaceResidentHouses(
  tx: Transaction,
  scope: {
    readonly familyId: string;
    readonly residentId: string;
    readonly expectedVersion: number;
    readonly houseIds: readonly string[];
    readonly updatedBy: string;
  },
): Promise<ResidentRow | null> {
  const [row] = await tx
    .update(residents)
    .set({ updatedBy: scope.updatedBy, version: sql`${residents.version} + 1` })
    .where(
      and(
        eq(residents.familyId, scope.familyId),
        eq(residents.id, scope.residentId),
        eq(residents.version, scope.expectedVersion),
        isNull(residents.deletedAt),
      ),
    )
    .returning();
  if (row === undefined) {
    return null;
  }
  await tx
    .delete(residentHouses)
    .where(and(eq(residentHouses.familyId, scope.familyId), eq(residentHouses.residentId, scope.residentId)));
  if (scope.houseIds.length > 0) {
    await tx.insert(residentHouses).values(
      scope.houseIds.map((houseId) => ({
        familyId: scope.familyId,
        residentId: scope.residentId,
        houseId,
      })),
    );
  }
  return row;
}

/**
 * Soft-deletes a resident when the version matches.
 *
 * @param tx - Transaction.
 * @param scope - Family, resident, expected version and actor.
 * @returns The deleted row, or null on a version mismatch.
 */
export async function deleteResident(
  tx: Transaction,
  scope: {
    readonly familyId: string;
    readonly residentId: string;
    readonly expectedVersion: number;
    readonly updatedBy: string;
  },
): Promise<ResidentRow | null> {
  const [row] = await tx
    .update(residents)
    .set({ deletedAt: new Date(), updatedBy: scope.updatedBy, version: sql`${residents.version} + 1` })
    .where(
      and(
        eq(residents.familyId, scope.familyId),
        eq(residents.id, scope.residentId),
        eq(residents.version, scope.expectedVersion),
        isNull(residents.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Reads the rescue profile of a resident.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param residentId - Resident id.
 * @returns The profile, or null.
 */
export async function findProfile(
  tx: Transaction,
  familyId: string,
  residentId: string,
): Promise<ProfileRow | null> {
  const [row] = await tx
    .select()
    .from(residentProfiles)
    .where(and(eq(residentProfiles.familyId, familyId), eq(residentProfiles.residentId, residentId)));
  return row ?? null;
}

/**
 * Lists profiles of the given residents.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param residentIds - Resident ids.
 * @returns Matching profiles.
 */
export async function listProfiles(
  tx: Transaction,
  familyId: string,
  residentIds: readonly string[],
): Promise<ProfileRow[]> {
  if (residentIds.length === 0) {
    return [];
  }
  return tx
    .select()
    .from(residentProfiles)
    .where(
      and(eq(residentProfiles.familyId, familyId), inArray(residentProfiles.residentId, [...residentIds])),
    );
}

/**
 * Replaces the rescue profile when the version matches.
 *
 * @param tx - Transaction.
 * @param scope - Family, resident and expected version.
 * @param patch - The whole card, without the child lists.
 * @returns The new profile, or null on a version mismatch.
 */
export async function updateProfile(
  tx: Transaction,
  scope: { readonly familyId: string; readonly residentId: string; readonly expectedVersion: number },
  patch: {
    readonly bloodGroup: ProfileRow['bloodGroup'];
    readonly mobility: ProfileRow['mobility'];
    readonly allergies: string[];
    readonly conditions: string[];
    readonly devices: string[];
    readonly updatedBy: string;
  },
): Promise<ProfileRow | null> {
  const [row] = await tx
    .update(residentProfiles)
    .set({
      bloodGroup: patch.bloodGroup,
      mobility: patch.mobility,
      allergies: patch.allergies,
      conditions: patch.conditions,
      medicalDevices: patch.devices,
      updatedBy: patch.updatedBy,
      version: sql`${residentProfiles.version} + 1`,
    })
    .where(
      and(
        eq(residentProfiles.familyId, scope.familyId),
        eq(residentProfiles.residentId, scope.residentId),
        eq(residentProfiles.version, scope.expectedVersion),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Lists lifesaving medicines of one or many residents, in call order.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param residentIds - Resident ids.
 * @returns Medicines ordered by sort order.
 */
export async function listMedicines(
  tx: Transaction,
  familyId: string,
  residentIds: readonly string[],
): Promise<MedicineRow[]> {
  if (residentIds.length === 0) {
    return [];
  }
  return tx
    .select()
    .from(lifesavingMedicines)
    .where(
      and(
        eq(lifesavingMedicines.familyId, familyId),
        inArray(lifesavingMedicines.residentId, [...residentIds]),
      ),
    )
    .orderBy(asc(lifesavingMedicines.sortOrder), asc(lifesavingMedicines.id));
}

/**
 * Replaces the lifesaving medicines of a resident. Order is the array order.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param residentId - Resident id.
 * @param items - Name and location of each medicine.
 * @returns The inserted rows.
 */
export async function replaceMedicines(
  tx: Transaction,
  familyId: string,
  residentId: string,
  items: readonly { readonly name: string; readonly location: string }[],
): Promise<MedicineRow[]> {
  await tx
    .delete(lifesavingMedicines)
    .where(and(eq(lifesavingMedicines.familyId, familyId), eq(lifesavingMedicines.residentId, residentId)));
  if (items.length === 0) {
    return [];
  }
  return tx
    .insert(lifesavingMedicines)
    .values(
      items.map((item, index) => ({
        familyId,
        residentId,
        name: item.name,
        location: item.location,
        sortOrder: index,
      })),
    )
    .returning();
}

/**
 * Lists emergency contacts of the given residents, in call order.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param residentIds - Resident ids.
 * @returns Contacts ordered by sort order.
 */
export async function listContacts(
  tx: Transaction,
  familyId: string,
  residentIds: readonly string[],
): Promise<ContactRow[]> {
  if (residentIds.length === 0) {
    return [];
  }
  return tx
    .select()
    .from(emergencyContacts)
    .where(
      and(eq(emergencyContacts.familyId, familyId), inArray(emergencyContacts.residentId, [...residentIds])),
    )
    .orderBy(asc(emergencyContacts.sortOrder), asc(emergencyContacts.id));
}

/**
 * Replaces the emergency contacts of a resident. The first item is called first.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param residentId - Resident id.
 * @param items - Contacts in call order.
 * @returns The inserted rows.
 */
export async function replaceContacts(
  tx: Transaction,
  familyId: string,
  residentId: string,
  items: readonly {
    readonly displayName: string;
    readonly phone: string | null;
    readonly relationship: string | null;
    readonly hasKeys: boolean;
  }[],
): Promise<ContactRow[]> {
  await tx
    .delete(emergencyContacts)
    .where(and(eq(emergencyContacts.familyId, familyId), eq(emergencyContacts.residentId, residentId)));
  if (items.length === 0) {
    return [];
  }
  return tx
    .insert(emergencyContacts)
    .values(items.map((item, index) => ({ familyId, residentId, ...item, sortOrder: index })))
    .returning();
}

/**
 * Residents of one house, oldest sort order first.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @returns Non-deleted residents linked to the house.
 */
export async function listResidentsOfHouse(
  tx: Transaction,
  familyId: string,
  houseId: string,
): Promise<ResidentRow[]> {
  const rows = await tx
    .select({ resident: residents })
    .from(residents)
    .innerJoin(
      residentHouses,
      and(
        eq(residentHouses.familyId, residents.familyId),
        eq(residentHouses.residentId, residents.id),
        eq(residentHouses.houseId, houseId),
      ),
    )
    .where(and(eq(residents.familyId, familyId), isNull(residents.deletedAt)))
    .orderBy(asc(residents.sortOrder), asc(residents.id));
  return rows.map((row) => row.resident);
}

/**
 * Inserts a pet and its house links.
 *
 * @param tx - Transaction.
 * @param input - Pet columns.
 * @returns The pet.
 */
export async function insertPet(
  tx: Transaction,
  input: {
    readonly familyId: string;
    readonly name: string;
    readonly species: PetRow['species'];
    readonly breed: string | null;
    readonly notes: string | null;
    readonly vetName: string | null;
    readonly vetPhone: string | null;
    readonly vetAddress: string | null;
    readonly houseIds: readonly string[];
    readonly createdBy: string;
  },
): Promise<PetRow> {
  const { houseIds, ...columns } = input;
  const [row] = await tx
    .insert(pets)
    .values({ ...columns, updatedBy: input.createdBy })
    .returning();
  if (row === undefined) {
    throw new Error('Pet insert returned no row');
  }
  if (houseIds.length > 0) {
    await tx
      .insert(petHouses)
      .values(houseIds.map((houseId) => ({ familyId: input.familyId, petId: row.id, houseId })));
  }
  return row;
}

/**
 * House links of the given pets.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param petIds - Pet ids.
 * @returns House ids keyed by pet id.
 */
export async function housesOfPets(
  tx: Transaction,
  familyId: string,
  petIds: readonly string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (petIds.length === 0) {
    return map;
  }
  const rows = await tx
    .select({ petId: petHouses.petId, houseId: petHouses.houseId })
    .from(petHouses)
    .where(and(eq(petHouses.familyId, familyId), inArray(petHouses.petId, [...petIds])));
  for (const row of rows) {
    map.set(row.petId, [...(map.get(row.petId) ?? []), row.houseId]);
  }
  return map;
}

/**
 * Lists non-deleted pets, optionally of one house.
 *
 * @param tx - Transaction.
 * @param page - Family, optional house and keyset.
 * @returns Up to `limit + 1` rows.
 */
export async function listPets(tx: Transaction, page: InstantPage): Promise<PetRow[]> {
  const after =
    page.after === null
      ? undefined
      : sql`(${pets.createdAt}, ${pets.id}) > (${page.after[0]}::timestamptz, ${page.after[1]}::uuid)`;
  const house =
    page.houseId === undefined
      ? undefined
      : sql`${pets.id} in (select pet_id from pet_houses where family_id = ${page.familyId} and house_id = ${page.houseId})`;
  return tx
    .select()
    .from(pets)
    .where(and(eq(pets.familyId, page.familyId), isNull(pets.deletedAt), house, after))
    .orderBy(asc(pets.createdAt), asc(pets.id))
    .limit(page.limit + 1);
}

/**
 * Reads one non-deleted pet.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param petId - Pet id.
 * @returns The row, or null.
 */
export async function findPet(tx: Transaction, familyId: string, petId: string): Promise<PetRow | null> {
  const [row] = await tx
    .select()
    .from(pets)
    .where(and(eq(pets.familyId, familyId), eq(pets.id, petId), isNull(pets.deletedAt)));
  return row ?? null;
}

/**
 * Updates a pet when the version matches. `houseIds`, when set, replaces the links.
 *
 * @param tx - Transaction.
 * @param scope - Family, pet and expected version.
 * @param patch - Columns and optional house ids.
 * @returns The pet, or null on a version mismatch.
 */
export async function updatePet(
  tx: Transaction,
  scope: { readonly familyId: string; readonly petId: string; readonly expectedVersion: number },
  patch: Partial<
    Pick<PetRow, 'name' | 'species' | 'breed' | 'notes' | 'vetName' | 'vetPhone' | 'vetAddress' | 'updatedBy'>
  > & {
    readonly houseIds?: readonly string[];
  },
): Promise<PetRow | null> {
  const { houseIds, ...columns } = patch;
  const [row] = await tx
    .update(pets)
    .set({ ...columns, version: sql`${pets.version} + 1` })
    .where(
      and(
        eq(pets.familyId, scope.familyId),
        eq(pets.id, scope.petId),
        eq(pets.version, scope.expectedVersion),
        isNull(pets.deletedAt),
      ),
    )
    .returning();
  if (row === undefined) {
    return null;
  }
  if (houseIds !== undefined) {
    await tx
      .delete(petHouses)
      .where(and(eq(petHouses.familyId, scope.familyId), eq(petHouses.petId, scope.petId)));
    if (houseIds.length > 0) {
      await tx
        .insert(petHouses)
        .values(houseIds.map((houseId) => ({ familyId: scope.familyId, petId: scope.petId, houseId })));
    }
  }
  return row;
}

/**
 * Soft-deletes a pet when the version matches.
 *
 * @param tx - Transaction.
 * @param scope - Family, pet, version and actor.
 * @returns The row, or null on a version mismatch.
 */
export async function deletePet(
  tx: Transaction,
  scope: {
    readonly familyId: string;
    readonly petId: string;
    readonly expectedVersion: number;
    readonly updatedBy: string;
  },
): Promise<PetRow | null> {
  const [row] = await tx
    .update(pets)
    .set({ deletedAt: new Date(), updatedBy: scope.updatedBy, version: sql`${pets.version} + 1` })
    .where(
      and(
        eq(pets.familyId, scope.familyId),
        eq(pets.id, scope.petId),
        eq(pets.version, scope.expectedVersion),
        isNull(pets.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Inserts a phone line.
 *
 * @param tx - Transaction.
 * @param input - Columns.
 * @returns The row.
 */
export async function insertPhoneLine(
  tx: Transaction,
  input: {
    readonly familyId: string;
    readonly residentId: string;
    readonly operatorName: string;
    readonly phoneNumber: string;
    readonly planName: string;
    readonly monthlyCostMinor: number | null;
    readonly currency: string | null;
    readonly renewalDate: string | null;
    readonly createdBy: string;
  },
): Promise<PhoneLineRow> {
  const [row] = await tx
    .insert(phoneLines)
    .values({ ...input, updatedBy: input.createdBy })
    .returning();
  if (row === undefined) {
    throw new Error('Phone line insert returned no row');
  }
  return row;
}

/**
 * Lists phone lines of a resident.
 *
 * @param tx - Transaction.
 * @param page - Family, resident and keyset.
 * @returns Up to `limit + 1` rows.
 */
export async function listPhoneLines(
  tx: Transaction,
  page: InstantPage & { readonly residentId: string },
): Promise<PhoneLineRow[]> {
  const after =
    page.after === null
      ? undefined
      : sql`(${phoneLines.createdAt}, ${phoneLines.id}) > (${page.after[0]}::timestamptz, ${page.after[1]}::uuid)`;
  return tx
    .select()
    .from(phoneLines)
    .where(
      and(
        eq(phoneLines.familyId, page.familyId),
        eq(phoneLines.residentId, page.residentId),
        isNull(phoneLines.deletedAt),
        after,
      ),
    )
    .orderBy(asc(phoneLines.createdAt), asc(phoneLines.id))
    .limit(page.limit + 1);
}

/**
 * Reads one phone line of a resident.
 *
 * @param tx - Transaction.
 * @param scope - Family, resident and line id.
 * @returns The row, or null.
 */
export async function findPhoneLine(
  tx: Transaction,
  scope: { readonly familyId: string; readonly residentId: string; readonly phoneLineId: string },
): Promise<PhoneLineRow | null> {
  const [row] = await tx
    .select()
    .from(phoneLines)
    .where(
      and(
        eq(phoneLines.familyId, scope.familyId),
        eq(phoneLines.residentId, scope.residentId),
        eq(phoneLines.id, scope.phoneLineId),
        isNull(phoneLines.deletedAt),
      ),
    );
  return row ?? null;
}

/**
 * Updates a phone line when the version matches.
 *
 * @param tx - Transaction.
 * @param scope - Identity and expected version.
 * @param patch - Columns.
 * @returns The row, or null on a version mismatch.
 */
export async function updatePhoneLine(
  tx: Transaction,
  scope: {
    readonly familyId: string;
    readonly residentId: string;
    readonly phoneLineId: string;
    readonly expectedVersion: number;
  },
  patch: Partial<
    Pick<
      PhoneLineRow,
      | 'operatorName'
      | 'phoneNumber'
      | 'planName'
      | 'monthlyCostMinor'
      | 'currency'
      | 'renewalDate'
      | 'updatedBy'
    >
  >,
): Promise<PhoneLineRow | null> {
  const [row] = await tx
    .update(phoneLines)
    .set({ ...patch, version: sql`${phoneLines.version} + 1` })
    .where(
      and(
        eq(phoneLines.familyId, scope.familyId),
        eq(phoneLines.residentId, scope.residentId),
        eq(phoneLines.id, scope.phoneLineId),
        eq(phoneLines.version, scope.expectedVersion),
        isNull(phoneLines.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Soft-deletes a phone line.
 *
 * @param tx - Transaction.
 * @param scope - Identity, version and actor.
 * @returns The row, or null on a version mismatch.
 */
export async function deletePhoneLine(
  tx: Transaction,
  scope: {
    readonly familyId: string;
    readonly residentId: string;
    readonly phoneLineId: string;
    readonly expectedVersion: number;
    readonly updatedBy: string;
  },
): Promise<PhoneLineRow | null> {
  const [row] = await tx
    .update(phoneLines)
    .set({ deletedAt: new Date(), updatedBy: scope.updatedBy, version: sql`${phoneLines.version} + 1` })
    .where(
      and(
        eq(phoneLines.familyId, scope.familyId),
        eq(phoneLines.id, scope.phoneLineId),
        eq(phoneLines.version, scope.expectedVersion),
        isNull(phoneLines.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Inserts a personal subscription.
 *
 * @param tx - Transaction.
 * @param input - Columns.
 * @returns The row.
 */
export async function insertSubscription(
  tx: Transaction,
  input: {
    readonly familyId: string;
    readonly residentId: string;
    readonly name: string;
    readonly providerName: string | null;
    readonly renewalDate: string | null;
    readonly costMinor: number | null;
    readonly currency: string | null;
    readonly notes: string | null;
    readonly createdBy: string;
  },
): Promise<SubscriptionRow> {
  const [row] = await tx
    .insert(subscriptions)
    .values({ ...input, updatedBy: input.createdBy })
    .returning();
  if (row === undefined) {
    throw new Error('Subscription insert returned no row');
  }
  return row;
}

/**
 * Lists subscriptions of a resident.
 *
 * @param tx - Transaction.
 * @param page - Family, resident and keyset.
 * @returns Up to `limit + 1` rows.
 */
export async function listSubscriptions(
  tx: Transaction,
  page: InstantPage & { readonly residentId: string },
): Promise<SubscriptionRow[]> {
  const after =
    page.after === null
      ? undefined
      : sql`(${subscriptions.createdAt}, ${subscriptions.id}) > (${page.after[0]}::timestamptz, ${page.after[1]}::uuid)`;
  return tx
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.familyId, page.familyId),
        eq(subscriptions.residentId, page.residentId),
        isNull(subscriptions.deletedAt),
        after,
      ),
    )
    .orderBy(asc(subscriptions.createdAt), asc(subscriptions.id))
    .limit(page.limit + 1);
}

/**
 * Reads one subscription.
 *
 * @param tx - Transaction.
 * @param scope - Family, resident and subscription id.
 * @returns The row, or null.
 */
export async function findSubscription(
  tx: Transaction,
  scope: { readonly familyId: string; readonly residentId: string; readonly subscriptionId: string },
): Promise<SubscriptionRow | null> {
  const [row] = await tx
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.familyId, scope.familyId),
        eq(subscriptions.residentId, scope.residentId),
        eq(subscriptions.id, scope.subscriptionId),
        isNull(subscriptions.deletedAt),
      ),
    );
  return row ?? null;
}

/**
 * Updates a subscription when the version matches.
 *
 * @param tx - Transaction.
 * @param scope - Identity and expected version.
 * @param patch - Columns.
 * @returns The row, or null on a version mismatch.
 */
export async function updateSubscription(
  tx: Transaction,
  scope: {
    readonly familyId: string;
    readonly residentId: string;
    readonly subscriptionId: string;
    readonly expectedVersion: number;
  },
  patch: Partial<
    Pick<
      SubscriptionRow,
      'name' | 'providerName' | 'renewalDate' | 'costMinor' | 'currency' | 'notes' | 'updatedBy'
    >
  >,
): Promise<SubscriptionRow | null> {
  const [row] = await tx
    .update(subscriptions)
    .set({ ...patch, version: sql`${subscriptions.version} + 1` })
    .where(
      and(
        eq(subscriptions.familyId, scope.familyId),
        eq(subscriptions.id, scope.subscriptionId),
        eq(subscriptions.version, scope.expectedVersion),
        isNull(subscriptions.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Soft-deletes a subscription.
 *
 * @param tx - Transaction.
 * @param scope - Identity, version and actor.
 * @returns The row, or null on a version mismatch.
 */
export async function deleteSubscription(
  tx: Transaction,
  scope: {
    readonly familyId: string;
    readonly subscriptionId: string;
    readonly expectedVersion: number;
    readonly updatedBy: string;
  },
): Promise<SubscriptionRow | null> {
  const [row] = await tx
    .update(subscriptions)
    .set({ deletedAt: new Date(), updatedBy: scope.updatedBy, version: sql`${subscriptions.version} + 1` })
    .where(
      and(
        eq(subscriptions.familyId, scope.familyId),
        eq(subscriptions.id, scope.subscriptionId),
        eq(subscriptions.version, scope.expectedVersion),
        isNull(subscriptions.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Inserts a vehicle.
 *
 * @param tx - Transaction.
 * @param input - Columns. The plate is already normalised.
 * @returns The row.
 */
export async function insertVehicle(
  tx: Transaction,
  input: {
    readonly familyId: string;
    readonly residentId: string;
    readonly plate: string;
    readonly make: string | null;
    readonly model: string | null;
    readonly insuranceRenewalDate: string | null;
    readonly roadTaxDueDate: string | null;
    readonly inspectionDueDate: string | null;
    readonly createdBy: string;
  },
): Promise<VehicleRow> {
  const [row] = await tx
    .insert(vehicles)
    .values({ ...input, updatedBy: input.createdBy })
    .returning();
  if (row === undefined) {
    throw new Error('Vehicle insert returned no row');
  }
  return row;
}

/**
 * Lists vehicles of a resident.
 *
 * @param tx - Transaction.
 * @param page - Family, resident and keyset.
 * @returns Up to `limit + 1` rows.
 */
export async function listVehicles(
  tx: Transaction,
  page: InstantPage & { readonly residentId: string },
): Promise<VehicleRow[]> {
  const after =
    page.after === null
      ? undefined
      : sql`(${vehicles.createdAt}, ${vehicles.id}) > (${page.after[0]}::timestamptz, ${page.after[1]}::uuid)`;
  return tx
    .select()
    .from(vehicles)
    .where(
      and(
        eq(vehicles.familyId, page.familyId),
        eq(vehicles.residentId, page.residentId),
        isNull(vehicles.deletedAt),
        after,
      ),
    )
    .orderBy(asc(vehicles.createdAt), asc(vehicles.id))
    .limit(page.limit + 1);
}

/**
 * Reads one vehicle.
 *
 * @param tx - Transaction.
 * @param scope - Family, resident and vehicle id.
 * @returns The row, or null.
 */
export async function findVehicle(
  tx: Transaction,
  scope: { readonly familyId: string; readonly residentId: string; readonly vehicleId: string },
): Promise<VehicleRow | null> {
  const [row] = await tx
    .select()
    .from(vehicles)
    .where(
      and(
        eq(vehicles.familyId, scope.familyId),
        eq(vehicles.residentId, scope.residentId),
        eq(vehicles.id, scope.vehicleId),
        isNull(vehicles.deletedAt),
      ),
    );
  return row ?? null;
}

/**
 * Updates a vehicle when the version matches.
 *
 * @param tx - Transaction.
 * @param scope - Identity and expected version.
 * @param patch - Columns.
 * @returns The row, or null on a version mismatch.
 */
export async function updateVehicle(
  tx: Transaction,
  scope: {
    readonly familyId: string;
    readonly residentId: string;
    readonly vehicleId: string;
    readonly expectedVersion: number;
  },
  patch: Partial<
    Pick<
      VehicleRow,
      | 'plate'
      | 'make'
      | 'model'
      | 'insuranceRenewalDate'
      | 'roadTaxDueDate'
      | 'inspectionDueDate'
      | 'updatedBy'
    >
  >,
): Promise<VehicleRow | null> {
  const [row] = await tx
    .update(vehicles)
    .set({ ...patch, version: sql`${vehicles.version} + 1` })
    .where(
      and(
        eq(vehicles.familyId, scope.familyId),
        eq(vehicles.id, scope.vehicleId),
        eq(vehicles.version, scope.expectedVersion),
        isNull(vehicles.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Soft-deletes a vehicle.
 *
 * @param tx - Transaction.
 * @param scope - Identity, version and actor.
 * @returns The row, or null on a version mismatch.
 */
export async function deleteVehicle(
  tx: Transaction,
  scope: {
    readonly familyId: string;
    readonly vehicleId: string;
    readonly expectedVersion: number;
    readonly updatedBy: string;
  },
): Promise<VehicleRow | null> {
  const [row] = await tx
    .update(vehicles)
    .set({ deletedAt: new Date(), updatedBy: scope.updatedBy, version: sql`${vehicles.version} + 1` })
    .where(
      and(
        eq(vehicles.familyId, scope.familyId),
        eq(vehicles.id, scope.vehicleId),
        eq(vehicles.version, scope.expectedVersion),
        isNull(vehicles.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Inserts personal bank-account metadata. The full number is not a column.
 *
 * @param tx - Transaction.
 * @param input - Institution, label and optional trailing digits.
 * @returns The row.
 */
export async function insertBankAccount(
  tx: Transaction,
  input: {
    readonly familyId: string;
    readonly residentId: string;
    readonly institution: string;
    readonly label: string;
    readonly referenceHint: string | null;
    readonly notes: string | null;
    readonly createdBy: string;
  },
): Promise<BankAccountRow> {
  const [row] = await tx
    .insert(personalBankAccounts)
    .values({ ...input, updatedBy: input.createdBy })
    .returning();
  if (row === undefined) {
    throw new Error('Bank account insert returned no row');
  }
  return row;
}

/**
 * Lists bank-account metadata of a resident.
 *
 * @param tx - Transaction.
 * @param page - Family, resident and keyset.
 * @returns Up to `limit + 1` rows.
 */
export async function listBankAccounts(
  tx: Transaction,
  page: InstantPage & { readonly residentId: string },
): Promise<BankAccountRow[]> {
  const after =
    page.after === null
      ? undefined
      : sql`(${personalBankAccounts.createdAt}, ${personalBankAccounts.id}) > (${page.after[0]}::timestamptz, ${page.after[1]}::uuid)`;
  return tx
    .select()
    .from(personalBankAccounts)
    .where(
      and(
        eq(personalBankAccounts.familyId, page.familyId),
        eq(personalBankAccounts.residentId, page.residentId),
        isNull(personalBankAccounts.deletedAt),
        after,
      ),
    )
    .orderBy(asc(personalBankAccounts.createdAt), asc(personalBankAccounts.id))
    .limit(page.limit + 1);
}

/**
 * Reads one bank-account metadata row.
 *
 * @param tx - Transaction.
 * @param scope - Family, resident and account id.
 * @returns The row, or null.
 */
export async function findBankAccount(
  tx: Transaction,
  scope: { readonly familyId: string; readonly residentId: string; readonly accountId: string },
): Promise<BankAccountRow | null> {
  const [row] = await tx
    .select()
    .from(personalBankAccounts)
    .where(
      and(
        eq(personalBankAccounts.familyId, scope.familyId),
        eq(personalBankAccounts.residentId, scope.residentId),
        eq(personalBankAccounts.id, scope.accountId),
        isNull(personalBankAccounts.deletedAt),
      ),
    );
  return row ?? null;
}

/**
 * Updates bank-account metadata when the version matches.
 *
 * @param tx - Transaction.
 * @param scope - Identity and expected version.
 * @param patch - Columns.
 * @returns The row, or null on a version mismatch.
 */
export async function updateBankAccount(
  tx: Transaction,
  scope: { readonly familyId: string; readonly accountId: string; readonly expectedVersion: number },
  patch: Partial<Pick<BankAccountRow, 'institution' | 'label' | 'referenceHint' | 'notes' | 'updatedBy'>>,
): Promise<BankAccountRow | null> {
  const [row] = await tx
    .update(personalBankAccounts)
    .set({ ...patch, version: sql`${personalBankAccounts.version} + 1` })
    .where(
      and(
        eq(personalBankAccounts.familyId, scope.familyId),
        eq(personalBankAccounts.id, scope.accountId),
        eq(personalBankAccounts.version, scope.expectedVersion),
        isNull(personalBankAccounts.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Soft-deletes bank-account metadata.
 *
 * @param tx - Transaction.
 * @param scope - Identity, version and actor.
 * @returns The row, or null on a version mismatch.
 */
export async function deleteBankAccount(
  tx: Transaction,
  scope: {
    readonly familyId: string;
    readonly accountId: string;
    readonly expectedVersion: number;
    readonly updatedBy: string;
  },
): Promise<BankAccountRow | null> {
  const [row] = await tx
    .update(personalBankAccounts)
    .set({
      deletedAt: new Date(),
      updatedBy: scope.updatedBy,
      version: sql`${personalBankAccounts.version} + 1`,
    })
    .where(
      and(
        eq(personalBankAccounts.familyId, scope.familyId),
        eq(personalBankAccounts.id, scope.accountId),
        eq(personalBankAccounts.version, scope.expectedVersion),
        isNull(personalBankAccounts.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Lists the tax items of one resident and year, in catalogue order.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param residentId - Resident id.
 * @param taxYear - Calendar year.
 * @returns The items.
 */
export async function listTaxItems(
  tx: Transaction,
  familyId: string,
  residentId: string,
  taxYear: number,
): Promise<TaxItemRow[]> {
  return tx
    .select()
    .from(taxChecklistItems)
    .where(
      and(
        eq(taxChecklistItems.familyId, familyId),
        eq(taxChecklistItems.residentId, residentId),
        eq(taxChecklistItems.taxYear, taxYear),
      ),
    )
    .orderBy(asc(taxChecklistItems.itemKey));
}

/**
 * Inserts missing tax items. Existing keys are left untouched.
 *
 * @param tx - Transaction.
 * @param input - Resident, year, keys that are not stored yet, and the actor.
 * @returns Nothing.
 */
export async function insertMissingTaxItems(
  tx: Transaction,
  input: {
    readonly familyId: string;
    readonly residentId: string;
    readonly taxYear: number;
    readonly keys: readonly TaxItemRow['itemKey'][];
    readonly createdBy: string;
  },
): Promise<void> {
  if (input.keys.length === 0) {
    return;
  }
  await tx
    .insert(taxChecklistItems)
    .values(
      input.keys.map((itemKey) => ({
        familyId: input.familyId,
        residentId: input.residentId,
        taxYear: input.taxYear,
        itemKey,
        createdBy: input.createdBy,
        updatedBy: input.createdBy,
      })),
    )
    .onConflictDoNothing();
}

/**
 * Reads one tax item.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param itemId - Item id.
 * @returns The row, or null.
 */
export async function findTaxItem(
  tx: Transaction,
  familyId: string,
  itemId: string,
): Promise<TaxItemRow | null> {
  const [row] = await tx
    .select()
    .from(taxChecklistItems)
    .where(and(eq(taxChecklistItems.familyId, familyId), eq(taxChecklistItems.id, itemId)));
  return row ?? null;
}

/**
 * Updates the status or due date of a tax item.
 *
 * @param tx - Transaction.
 * @param scope - Family, item and expected version.
 * @param patch - Columns.
 * @returns The row, or null on a version mismatch.
 */
export async function updateTaxItem(
  tx: Transaction,
  scope: { readonly familyId: string; readonly itemId: string; readonly expectedVersion: number },
  patch: Partial<Pick<TaxItemRow, 'dueDate' | 'status' | 'updatedBy'>>,
): Promise<TaxItemRow | null> {
  const [row] = await tx
    .update(taxChecklistItems)
    .set({ ...patch, version: sql`${taxChecklistItems.version} + 1` })
    .where(
      and(
        eq(taxChecklistItems.familyId, scope.familyId),
        eq(taxChecklistItems.id, scope.itemId),
        eq(taxChecklistItems.version, scope.expectedVersion),
      ),
    )
    .returning();
  return row ?? null;
}
