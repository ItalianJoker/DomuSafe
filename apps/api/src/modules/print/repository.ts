import {
  BLOOD_GROUPS,
  MOBILITY_STATUSES,
  PET_SPECIES,
  PUBLICATION_READING_LIMIT,
  formatHouseAddress,
  type DeviceLabel,
  type PublicHousePage,
  type PublicRescueSheet,
  type PublicationKind,
} from '@domusafe/contracts';
import {
  contacts,
  emergencyContacts,
  houseShutoffs,
  houses,
  lifesavingMedicines,
  petHouses,
  pets,
  publicationReadings,
  publications,
  residentHouses,
  residentProfiles,
  residents,
  type Transaction,
} from '@domusafe/db';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';

/** A stored printed code. */
export interface PublicationRow {
  readonly id: string;
  readonly familyId: string;
  readonly houseId: string;
  readonly kind: PublicationKind;
  readonly token: string | null;
  readonly revokedAt: Date | null;
  readonly lastScannedAt: Date | null;
  readonly scanCount: number;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** A code found from its hash, before the family context is known. */
export interface TokenHit {
  readonly id: string;
  readonly familyId: string;
  readonly houseId: string;
  readonly kind: PublicationKind;
  readonly revokedAt: Date | null;
}

const WALL_KINDS = ['water', 'gas', 'electricity'] as const;

function asDate(value: Date | string | null): Date | null {
  if (value === null) {
    return null;
  }
  return value instanceof Date ? value : new Date(value);
}

function phrases(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string' && item.trim() !== '').slice(0, 40);
}

function oneOf<T extends string>(values: readonly T[], value: string | null): T | null {
  if (value === null) {
    return null;
  }
  return values.find((item) => item === value) ?? null;
}

/**
 * Reads one house that is still in use.
 *
 * Preconditions: the transaction already has this family's context.
 * Postconditions: a soft-deleted house is absent.
 * Data contract: only the name and the address columns are returned.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @returns The house, or null.
 */
export async function findHouse(
  tx: Transaction,
  familyId: string,
  houseId: string,
): Promise<{
  readonly name: string;
  readonly addressLine: string | null;
  readonly postalCode: string | null;
  readonly city: string | null;
  readonly province: string | null;
} | null> {
  const [row] = await tx
    .select({
      name: houses.name,
      addressLine: houses.addressLine,
      postalCode: houses.postalCode,
      city: houses.city,
      province: houses.province,
    })
    .from(houses)
    .where(and(eq(houses.familyId, familyId), eq(houses.id, houseId), isNull(houses.deletedAt)));
  return row ?? null;
}

/**
 * Lists the codes of one house, newest first.
 *
 * Preconditions: the caller can edit the house. Row security enforces that again.
 * Postconditions: at most 20 rows.
 * Data contract: the token is null once the code is revoked.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @returns The rows.
 */
export async function listPublications(
  tx: Transaction,
  familyId: string,
  houseId: string,
): Promise<PublicationRow[]> {
  return tx
    .select({
      id: publications.id,
      familyId: publications.familyId,
      houseId: publications.houseId,
      kind: publications.kind,
      token: publications.token,
      revokedAt: publications.revokedAt,
      lastScannedAt: publications.lastScannedAt,
      scanCount: publications.scanCount,
      version: publications.version,
      createdAt: publications.createdAt,
      updatedAt: publications.updatedAt,
    })
    .from(publications)
    .where(and(eq(publications.familyId, familyId), eq(publications.houseId, houseId)))
    .orderBy(desc(publications.createdAt))
    .limit(20);
}

/**
 * Reads the active code of one kind.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @param kind - House page or rescue sheet.
 * @returns The row, or null.
 */
export async function findActive(
  tx: Transaction,
  familyId: string,
  houseId: string,
  kind: PublicationKind,
): Promise<PublicationRow | null> {
  const [row] = await tx
    .select({
      id: publications.id,
      familyId: publications.familyId,
      houseId: publications.houseId,
      kind: publications.kind,
      token: publications.token,
      revokedAt: publications.revokedAt,
      lastScannedAt: publications.lastScannedAt,
      scanCount: publications.scanCount,
      version: publications.version,
      createdAt: publications.createdAt,
      updatedAt: publications.updatedAt,
    })
    .from(publications)
    .where(
      and(
        eq(publications.familyId, familyId),
        eq(publications.houseId, houseId),
        eq(publications.kind, kind),
        isNull(publications.revokedAt),
      ),
    );
  return row ?? null;
}

/**
 * Reads one code of a house.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @param publicationId - Code id.
 * @returns The row, or null.
 */
export async function findPublication(
  tx: Transaction,
  familyId: string,
  houseId: string,
  publicationId: string,
): Promise<PublicationRow | null> {
  const [row] = await tx
    .select({
      id: publications.id,
      familyId: publications.familyId,
      houseId: publications.houseId,
      kind: publications.kind,
      token: publications.token,
      revokedAt: publications.revokedAt,
      lastScannedAt: publications.lastScannedAt,
      scanCount: publications.scanCount,
      version: publications.version,
      createdAt: publications.createdAt,
      updatedAt: publications.updatedAt,
    })
    .from(publications)
    .where(
      and(
        eq(publications.familyId, familyId),
        eq(publications.houseId, houseId),
        eq(publications.id, publicationId),
      ),
    );
  return row ?? null;
}

/**
 * Inserts an active code.
 *
 * Preconditions: no other active code of this kind exists for the house.
 * Postconditions: the token and its hash are stored together.
 * Data contract: the hash is 32 bytes.
 *
 * @param tx - Transaction.
 * @param input - Family, house, kind, token and the account that prepared it.
 * @returns The row.
 */
export async function insertPublication(
  tx: Transaction,
  input: {
    readonly familyId: string;
    readonly houseId: string;
    readonly kind: PublicationKind;
    readonly token: string;
    readonly tokenHash: Uint8Array<ArrayBuffer>;
    readonly createdBy: string;
  },
): Promise<PublicationRow> {
  const [row] = await tx
    .insert(publications)
    .values({
      familyId: input.familyId,
      houseId: input.houseId,
      kind: input.kind,
      token: input.token,
      tokenHash: input.tokenHash,
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
    })
    .returning({
      id: publications.id,
      familyId: publications.familyId,
      houseId: publications.houseId,
      kind: publications.kind,
      token: publications.token,
      revokedAt: publications.revokedAt,
      lastScannedAt: publications.lastScannedAt,
      scanCount: publications.scanCount,
      version: publications.version,
      createdAt: publications.createdAt,
      updatedAt: publications.updatedAt,
    });
  if (row === undefined) {
    throw new Error('Insert returned no publication');
  }
  return row;
}

/**
 * Revokes a code when the version matches.
 *
 * Preconditions: `expectedVersion` is the version the editor loaded.
 * Postconditions: the raw token is cleared and the hash remains.
 * Data contract: a conflicting version updates nothing.
 *
 * @param tx - Transaction.
 * @param scope - Family, house, code and expected version.
 * @param updatedBy - Account revoking the code.
 * @returns The revoked row, or null when the version did not match.
 */
export async function revokePublication(
  tx: Transaction,
  scope: {
    readonly familyId: string;
    readonly houseId: string;
    readonly publicationId: string;
    readonly expectedVersion: number;
  },
  updatedBy: string,
): Promise<PublicationRow | null> {
  const [row] = await tx
    .update(publications)
    .set({
      token: null,
      revokedAt: new Date(),
      version: scope.expectedVersion + 1,
      updatedBy,
    })
    .where(
      and(
        eq(publications.familyId, scope.familyId),
        eq(publications.houseId, scope.houseId),
        eq(publications.id, scope.publicationId),
        eq(publications.version, scope.expectedVersion),
        isNull(publications.revokedAt),
      ),
    )
    .returning({
      id: publications.id,
      familyId: publications.familyId,
      houseId: publications.houseId,
      kind: publications.kind,
      token: publications.token,
      revokedAt: publications.revokedAt,
      lastScannedAt: publications.lastScannedAt,
      scanCount: publications.scanCount,
      version: publications.version,
      createdAt: publications.createdAt,
      updatedAt: publications.updatedAt,
    });
  return row ?? null;
}

/**
 * Resolves a public token hash without a signed-in account.
 *
 * Preconditions: `tokenHash` is the SHA-256 of the token from the address.
 * Postconditions: an unknown hash returns null. The raw token is not returned.
 * Data contract: only the identity of the code and whether it is revoked.
 *
 * @param tx - Transaction. Family context is not required.
 * @param tokenHash - SHA-256 of the token.
 * @returns The hit, or null.
 */
export async function findByToken(
  tx: Transaction,
  tokenHash: Uint8Array<ArrayBuffer>,
): Promise<TokenHit | null> {
  const result = await tx.execute<{
    id: string;
    family_id: string;
    house_id: string;
    kind: PublicationKind;
    revoked_at: Date | string | null;
  }>(
    sql`select id, family_id, house_id, kind, revoked_at from app.publication_by_token(${Buffer.from(tokenHash)})`,
  );
  const row = result.rows[0];
  if (row === undefined) {
    return null;
  }
  return {
    id: row.id,
    familyId: row.family_id,
    houseId: row.house_id,
    kind: row.kind,
    revokedAt: asDate(row.revoked_at),
  };
}

/** One stored reading: time, code kind and optional device label. */
export interface PublicationReadingRow {
  readonly occurredAt: Date;
  readonly kind: PublicationKind;
  readonly deviceLabel: string | null;
}

/**
 * Appends a reading. The row has no health data, vault contents or account numbers.
 *
 * Preconditions: the transaction is the system principal of this family.
 * Postconditions: one row exists with the given kind and label.
 * Data contract: only family, house, time, kind and label are written.
 *
 * @param tx - Transaction.
 * @param input - House, code kind and the label the browser sent, or null.
 */
export async function recordReading(
  tx: Transaction,
  input: {
    readonly familyId: string;
    readonly houseId: string;
    readonly kind: PublicationKind;
    readonly deviceLabel: DeviceLabel | null;
  },
): Promise<void> {
  await tx.insert(publicationReadings).values({
    familyId: input.familyId,
    houseId: input.houseId,
    kind: input.kind,
    deviceLabel: input.deviceLabel,
  });
}

/**
 * Lists readings of one house, newest first.
 *
 * Preconditions: the transaction belongs to a member who can edit the house.
 * Postconditions: at most {@link PUBLICATION_READING_LIMIT} rows, newest first.
 * Data contract: each row is time, kind and label.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @returns The readings.
 */
export async function listReadings(
  tx: Transaction,
  familyId: string,
  houseId: string,
): Promise<readonly PublicationReadingRow[]> {
  return tx
    .select({
      occurredAt: publicationReadings.occurredAt,
      kind: publicationReadings.kind,
      deviceLabel: publicationReadings.deviceLabel,
    })
    .from(publicationReadings)
    .where(and(eq(publicationReadings.familyId, familyId), eq(publicationReadings.houseId, houseId)))
    .orderBy(desc(publicationReadings.occurredAt), desc(publicationReadings.id))
    .limit(PUBLICATION_READING_LIMIT);
}

/**
 * Records that a public page was opened. The address and the account are not stored.
 *
 * Preconditions: the transaction is the system principal of this family.
 * Postconditions: `last_scanned_at` is now and the counter increases by one.
 * Data contract: no address, account or request body is written.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param publicationId - Code id.
 */
export async function markScanned(tx: Transaction, familyId: string, publicationId: string): Promise<void> {
  await tx.execute(sql`
    update public.publications
    set last_scanned_at = now(), scan_count = scan_count + 1
    where id = ${publicationId} and family_id = ${familyId}
  `);
}

/**
 * Public house page: water, gas, power, tradespeople and the first emergency contact.
 *
 * Preconditions: the transaction is the system principal of this family.
 * Postconditions: null when the house is gone.
 * Data contract: utilities, the house manual, notes and bank columns are not selected.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @returns The page, or null.
 */
export async function loadHousePage(
  tx: Transaction,
  familyId: string,
  houseId: string,
): Promise<Omit<PublicHousePage, 'mark'> | null> {
  const house = await findHouse(tx, familyId, houseId);
  if (house === null) {
    return null;
  }
  const shutoffs = await tx
    .select({
      kind: houseShutoffs.kind,
      location: houseShutoffs.location,
      instructions: houseShutoffs.instructions,
    })
    .from(houseShutoffs)
    .where(
      and(
        eq(houseShutoffs.familyId, familyId),
        eq(houseShutoffs.houseId, houseId),
        inArray(houseShutoffs.kind, [...WALL_KINDS]),
        isNull(houseShutoffs.deletedAt),
      ),
    )
    .orderBy(asc(houseShutoffs.kind), asc(houseShutoffs.createdAt))
    .limit(30);
  const trades = await tx
    .select({
      displayName: contacts.displayName,
      trade: contacts.trade,
      phone: contacts.phone,
      company: contacts.company,
    })
    .from(contacts)
    .where(
      and(
        eq(contacts.familyId, familyId),
        eq(contacts.houseId, houseId),
        eq(contacts.kind, 'craftsman'),
        isNull(contacts.deletedAt),
      ),
    )
    .orderBy(asc(contacts.displayName))
    .limit(50);
  const [primary] = await tx
    .select({
      displayName: emergencyContacts.displayName,
      phone: emergencyContacts.phone,
      relationship: emergencyContacts.relationship,
    })
    .from(emergencyContacts)
    .innerJoin(
      residents,
      and(eq(residents.familyId, emergencyContacts.familyId), eq(residents.id, emergencyContacts.residentId)),
    )
    .innerJoin(
      residentHouses,
      and(
        eq(residentHouses.familyId, residents.familyId),
        eq(residentHouses.residentId, residents.id),
        eq(residentHouses.houseId, houseId),
      ),
    )
    .where(and(eq(emergencyContacts.familyId, familyId), isNull(residents.deletedAt)))
    .orderBy(asc(residents.sortOrder), asc(emergencyContacts.sortOrder), asc(emergencyContacts.id))
    .limit(1);
  return {
    houseName: house.name,
    address: formatHouseAddress(house),
    shutoffs: shutoffs.flatMap((row) => {
      const kind = oneOf(WALL_KINDS, row.kind);
      return kind === null ? [] : [{ kind, location: row.location, instructions: row.instructions }];
    }),
    tradespeople: trades.map((row) => ({
      displayName: row.displayName,
      trade: row.trade,
      phone: row.phone,
      company: row.company,
    })),
    primaryContact: primary ?? null,
  };
}

/**
 * Public rescue sheet of one house.
 *
 * Preconditions: the transaction is the system principal of this family.
 * Postconditions: null when the house is gone.
 * Data contract: health facts, emergency contacts and the veterinary phone. No account numbers.
 *
 * @param tx - Transaction.
 * @param familyId - Family id.
 * @param houseId - House id.
 * @returns The sheet, or null.
 */
export async function loadRescueSheet(
  tx: Transaction,
  familyId: string,
  houseId: string,
): Promise<Omit<PublicRescueSheet, 'mark'> | null> {
  const house = await findHouse(tx, familyId, houseId);
  if (house === null) {
    return null;
  }
  const people = await tx
    .select({
      id: residents.id,
      displayName: residents.displayName,
      birthYear: residents.birthYear,
      usualBedroom: residents.usualBedroom,
      photo: residents.photo,
    })
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
    .orderBy(asc(residents.sortOrder), asc(residents.id))
    .limit(50);
  const ids = people.map((person) => person.id);
  const profiles =
    ids.length === 0
      ? []
      : await tx
          .select({
            residentId: residentProfiles.residentId,
            bloodGroup: residentProfiles.bloodGroup,
            mobility: residentProfiles.mobility,
            allergies: residentProfiles.allergies,
            conditions: residentProfiles.conditions,
            medicalDevices: residentProfiles.medicalDevices,
          })
          .from(residentProfiles)
          .where(and(eq(residentProfiles.familyId, familyId), inArray(residentProfiles.residentId, ids)));
  const medicines =
    ids.length === 0
      ? []
      : await tx
          .select({
            id: lifesavingMedicines.id,
            residentId: lifesavingMedicines.residentId,
            name: lifesavingMedicines.name,
            location: lifesavingMedicines.location,
            sortOrder: lifesavingMedicines.sortOrder,
          })
          .from(lifesavingMedicines)
          .where(
            and(eq(lifesavingMedicines.familyId, familyId), inArray(lifesavingMedicines.residentId, ids)),
          )
          .orderBy(asc(lifesavingMedicines.sortOrder), asc(lifesavingMedicines.id));
  const peopleContacts =
    ids.length === 0
      ? []
      : await tx
          .select({
            id: emergencyContacts.id,
            residentId: emergencyContacts.residentId,
            displayName: emergencyContacts.displayName,
            phone: emergencyContacts.phone,
            relationship: emergencyContacts.relationship,
            hasKeys: emergencyContacts.hasKeys,
            sortOrder: emergencyContacts.sortOrder,
          })
          .from(emergencyContacts)
          .where(and(eq(emergencyContacts.familyId, familyId), inArray(emergencyContacts.residentId, ids)))
          .orderBy(asc(emergencyContacts.sortOrder), asc(emergencyContacts.id));
  const animals = await tx
    .select({
      id: pets.id,
      name: pets.name,
      species: pets.species,
      vetName: pets.vetName,
      vetPhone: pets.vetPhone,
      vetAddress: pets.vetAddress,
    })
    .from(pets)
    .innerJoin(petHouses, and(eq(petHouses.familyId, pets.familyId), eq(petHouses.petId, pets.id)))
    .where(and(eq(pets.familyId, familyId), eq(petHouses.houseId, houseId), isNull(pets.deletedAt)))
    .orderBy(asc(pets.name))
    .limit(50);
  const profileById = new Map(profiles.map((row) => [row.residentId, row]));
  return {
    houseName: house.name,
    residents: people.map((person) => {
      const profile = profileById.get(person.id);
      return {
        id: person.id,
        displayName: person.displayName,
        birthYear: person.birthYear,
        usualBedroom: person.usualBedroom,
        photo: person.photo,
        bloodGroup: oneOf(BLOOD_GROUPS, profile?.bloodGroup ?? null),
        mobility: oneOf(MOBILITY_STATUSES, profile?.mobility ?? null),
        allergies: phrases(profile?.allergies),
        conditions: phrases(profile?.conditions),
        devices: phrases(profile?.medicalDevices),
        medicines: medicines
          .filter((item) => item.residentId === person.id)
          .map((item) => ({
            id: item.id,
            name: item.name,
            location: item.location,
            sortOrder: item.sortOrder,
          })),
        contacts: peopleContacts
          .filter((item) => item.residentId === person.id)
          .map((item) => ({
            id: item.id,
            displayName: item.displayName,
            phone: item.phone,
            relationship: item.relationship,
            hasKeys: item.hasKeys,
            sortOrder: item.sortOrder,
          })),
      };
    }),
    pets: animals.flatMap((row) => {
      const species = oneOf(PET_SPECIES, row.species);
      return species === null
        ? []
        : [
            {
              id: row.id,
              name: row.name,
              species,
              vetName: row.vetName,
              vetPhone: row.vetPhone,
              vetAddress: row.vetAddress,
            },
          ];
    }),
  };
}
