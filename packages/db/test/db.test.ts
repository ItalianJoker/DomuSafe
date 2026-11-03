import { CURRENCIES } from '@domusafe/contracts';
import { PgTable, getTableConfig } from 'drizzle-orm/pg-core';
import { eq, is, sql } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import {
  auditEvents,
  createDatabase,
  createPool,
  houses,
  keyScopes,
  memberships,
  recordAudit,
  recordRevision,
  revisions,
  schema,
  scopeKeyGrants,
  scopeKeyVersions,
  setFamilyContext,
  withContext,
  type Database,
  type DbPrincipal,
} from '../src/index.js';
import { createTestDatabase, requireAdminUrl, type TestDatabase } from '../src/testing.js';

let testDb: TestDatabase;
let appPool: pg.Pool;
let admin: pg.Pool;
let db: Database;

const ids = {
  alice: '01900000-0000-7000-8000-00000000a001',
  bob: '01900000-0000-7000-8000-00000000b002',
  carol: '01900000-0000-7000-8000-00000000c003',
  dave: '01900000-0000-7000-8000-00000000d004',
};
const account = (accountId: string): DbPrincipal => ({ kind: 'account', accountId });

async function dbError(work: Promise<unknown>): Promise<string> {
  try {
    await work;
  } catch (error) {
    const cause = error instanceof Error ? error.cause : undefined;
    return cause instanceof Error ? cause.message : String(error);
  }
  throw new Error('Expected the database operation to fail');
}

async function createAccount(id: string, name: string): Promise<void> {
  await admin.query('insert into auth_users (id, name, email, email_verified) values ($1, $2, $3, true)', [
    id,
    name,
    `${name.toLowerCase()}@example.test`,
  ]);
  await admin.query('insert into account_profiles (account_id, display_name) values ($1, $2)', [id, name]);
}

async function createFamily(owner: string, name: string): Promise<{ familyId: string; houseId: string }> {
  return withContext(db, { principal: account(owner) }, async (tx) => {
    const result = await tx.execute<{ id: string }>(
      sql`select app.create_family(${name}, 'Europe/Rome', 'EUR', 'it') as id`,
    );
    const familyId = result.rows[0]!.id;
    await setFamilyContext(tx, account(owner), familyId);
    const [house] = await tx
      .insert(houses)
      .values({ familyId, name: `Casa ${name}` })
      .returning({ id: houses.id });
    return { familyId, houseId: house!.id };
  });
}

let alice: { familyId: string; houseId: string };
let bob: { familyId: string; houseId: string };
let aliceSecondHouse: string;

beforeAll(async () => {
  testDb = await createTestDatabase(requireAdminUrl(), inject('templateDatabase'));
  admin = new pg.Pool({ connectionString: testDb.adminUrl, max: 2 });
  appPool = createPool(testDb.appUrl, { max: 4 });
  db = createDatabase(appPool);
  await createAccount(ids.alice, 'Alice');
  await createAccount(ids.bob, 'Bob');
  await createAccount(ids.carol, 'Carol');
  await createAccount(ids.dave, 'Dave');
  alice = await createFamily(ids.alice, 'Rossi');
  bob = await createFamily(ids.bob, 'Bianchi');
  aliceSecondHouse = await withContext(
    db,
    { principal: account(ids.alice), familyId: alice.familyId },
    async (tx) => {
      const [house] = await tx
        .insert(houses)
        .values({ familyId: alice.familyId, name: 'Casa al mare' })
        .returning({ id: houses.id });
      return house!.id;
    },
  );
  await admin.query(`insert into memberships (family_id, account_id, role) values ($1, $2, 'parent')`, [
    alice.familyId,
    ids.carol,
  ]);
  const guest = await admin.query<{ id: string }>(
    `insert into memberships (family_id, account_id, role, all_houses, all_residents, expires_at)
     values ($1, $2, 'guest', false, false, now() + interval '7 days') returning id`,
    [alice.familyId, ids.dave],
  );
  await admin.query(
    'insert into membership_houses (membership_id, family_id, house_id) values ($1, $2, $3)',
    [guest.rows[0]!.id, alice.familyId, aliceSecondHouse],
  );
});

afterAll(async () => {
  await appPool.end();
  await admin.end();
  await testDb.drop();
});

describe('schema', () => {
  it('seeds exactly the currencies of the contracts package', async () => {
    const rows = await admin.query<{ code: string; minor_unit: number }>(
      'select code, minor_unit from currencies order by code',
    );
    expect(rows.rows.map((row) => [row.code, row.minor_unit])).toEqual(
      [...CURRENCIES]
        .map((c) => [c.code, c.minorUnit])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    );
  });

  it('mirrors every SQL table in the Drizzle schema with matching columns', async () => {
    const tables = Object.values(schema).flatMap((value) => (is(value, PgTable) ? [value] : []));
    const sqlTables = await admin.query<{ name: string }>(
      `select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relispartition
         and c.relname <> 'schema_migrations' order by 1`,
    );
    expect(tables.map((table) => getTableConfig(table).name).sort()).toEqual(
      sqlTables.rows.map((row) => row.name),
    );

    for (const table of tables) {
      const config = getTableConfig(table);
      const columns = await admin.query<{
        column_name: string;
        is_nullable: string;
        data_type: string;
        udt_name: string;
        character_maximum_length: number | null;
      }>(
        `select column_name, is_nullable, data_type, udt_name, character_maximum_length
         from information_schema.columns where table_schema = 'public' and table_name = $1`,
        [config.name],
      );
      const actual = new Map(
        columns.rows.map((row) => [
          row.column_name,
          {
            notNull: row.is_nullable === 'NO',
            type:
              row.data_type === 'USER-DEFINED'
                ? row.udt_name
                : row.data_type === 'character'
                  ? `char(${String(row.character_maximum_length)})`
                  : row.data_type,
          },
        ]),
      );
      expect([...actual.keys()].sort(), config.name).toEqual(
        config.columns.map((column) => column.name).sort(),
      );
      for (const column of config.columns) {
        expect(actual.get(column.name), `${config.name}.${column.name}`).toEqual({
          notNull: column.notNull,
          type: column.getSQLType(),
        });
      }
    }
  });

  it('configures Italian full-text search without accents', async () => {
    const result = await admin.query<{ v: string }>(
      `select to_tsvector('domusafe_it', 'Città caldaie')::text as v`,
    );
    expect(result.rows[0]!.v).toBe("'caldai':2 'citt':1");
  });
});

describe('row-level security', () => {
  it('isolates families from each other', async () => {
    const visible = await withContext(db, { principal: account(ids.alice), familyId: alice.familyId }, (tx) =>
      tx.select({ id: houses.id, familyId: houses.familyId }).from(houses),
    );
    expect(visible.every((row) => row.familyId === alice.familyId)).toBe(true);
    expect(visible).toHaveLength(2);

    const intruding = await withContext(db, { principal: account(ids.alice), familyId: bob.familyId }, (tx) =>
      tx.select().from(houses),
    );
    expect(intruding).toEqual([]);
    expect(
      await dbError(
        withContext(db, { principal: account(ids.alice), familyId: bob.familyId }, (tx) =>
          tx.insert(houses).values({ familyId: bob.familyId, name: 'Intrusa' }),
        ),
      ),
    ).toMatch(/row-level security/);
  });

  it('lists only the families of the account', async () => {
    const rows = await withContext(db, { principal: account(ids.alice) }, (tx) =>
      tx.select({ id: schema.families.id }).from(schema.families),
    );
    expect(rows.map((row) => row.id)).toEqual([alice.familyId]);
  });

  it('restricts guests to their assigned house and expires them', async () => {
    const seen = await withContext(db, { principal: account(ids.dave), familyId: alice.familyId }, (tx) =>
      tx.select({ id: houses.id }).from(houses),
    );
    expect(seen.map((row) => row.id)).toEqual([aliceSecondHouse]);
    await admin.query(
      `update memberships set expires_at = now() - interval '1 minute' where account_id = $1`,
      [ids.dave],
    );
    const afterExpiry = await withContext(
      db,
      { principal: account(ids.dave), familyId: alice.familyId },
      (tx) => tx.select({ id: houses.id }).from(houses),
    );
    expect(afterExpiry).toEqual([]);
  });

  it('reserves house management to administrators', async () => {
    expect(
      await dbError(
        withContext(db, { principal: account(ids.carol), familyId: alice.familyId }, (tx) =>
          tx.insert(houses).values({ familyId: alice.familyId, name: 'Casa del Genitore' }),
        ),
      ),
    ).toMatch(/row-level security/);
    const updated = await withContext(db, { principal: account(ids.carol), familyId: alice.familyId }, (tx) =>
      tx.update(houses).set({ name: 'Rinominata' }).where(eq(houses.id, alice.houseId)).returning(),
    );
    expect(updated).toEqual([]);
  });

  it('keeps the family owner an active administrator', async () => {
    expect(
      await dbError(
        withContext(db, { principal: account(ids.alice), familyId: alice.familyId }, (tx) =>
          tx.update(memberships).set({ role: 'parent' }).where(eq(memberships.accountId, ids.alice)),
        ),
      ),
    ).toMatch(/family owner must be an active administrator/);
  });

  it('only lets accounts create families for themselves', async () => {
    expect(
      await dbError(
        withContext(db, { principal: { kind: 'system' } }, (tx) =>
          tx.execute(sql`select app.create_family('Sistema', 'Europe/Rome', 'EUR', 'it')`),
        ),
      ),
    ).toMatch(/Only an account can create a family/);
  });

  it('hides personal revisions from other administrators', async () => {
    await withContext(db, { principal: account(ids.carol), familyId: alice.familyId }, (tx) =>
      recordRevision(tx, {
        familyId: alice.familyId,
        resourceType: 'vehicles',
        resourceId: '01900000-0000-7000-8000-0000000e0001',
        version: 1,
        op: 'create',
        actor: { kind: 'account', id: ids.carol },
        data: { plate: 'AB123CD' },
        ownerAccountId: ids.carol,
      }),
    );
    const asAlice = await withContext(db, { principal: account(ids.alice), familyId: alice.familyId }, (tx) =>
      tx.select().from(revisions).where(eq(revisions.resourceType, 'vehicles')),
    );
    expect(asAlice).toEqual([]);
    const asCarol = await withContext(db, { principal: account(ids.carol), familyId: alice.familyId }, (tx) =>
      tx.select().from(revisions).where(eq(revisions.resourceType, 'vehicles')),
    );
    expect(asCarol).toHaveLength(1);
  });

  it('keeps the audit log append-only and readable by administrators only', async () => {
    await withContext(db, { principal: account(ids.carol), familyId: alice.familyId }, (tx) =>
      recordAudit(tx, {
        familyId: alice.familyId,
        actor: { kind: 'account', id: ids.carol },
        action: 'tenancy.house.updated',
        resourceType: 'houses',
        resourceId: alice.houseId,
        outcome: 'success',
      }),
    );
    const asParent = await withContext(
      db,
      { principal: account(ids.carol), familyId: alice.familyId },
      (tx) => tx.select().from(auditEvents),
    );
    expect(asParent).toEqual([]);
    const asAdmin = await withContext(db, { principal: account(ids.alice), familyId: alice.familyId }, (tx) =>
      tx.select().from(auditEvents),
    );
    expect(asAdmin.map((event) => event.action)).toContain('tenancy.house.updated');
    expect(
      await dbError(
        withContext(db, { principal: account(ids.alice), familyId: alice.familyId }, (tx) =>
          tx.delete(auditEvents),
        ),
      ),
    ).toMatch(/permission denied/);
  });

  it('accepts vault scope grants only for vault keys', async () => {
    const scopeId = '01900000-0000-7000-8000-0000000f0001';
    const blob = new Uint8Array(95);
    blob[0] = 1;
    await withContext(db, { principal: account(ids.alice), familyId: alice.familyId }, async (tx) => {
      await tx
        .insert(keyScopes)
        .values({ id: scopeId, familyId: alice.familyId, kind: 'vault_family', createdBy: ids.alice });
      await tx.insert(scopeKeyVersions).values({ scopeId, version: 1, createdBy: ids.alice });
      await tx.insert(scopeKeyGrants).values({
        familyId: alice.familyId,
        scopeId,
        version: 1,
        grantee: 'vault',
        granteeAccountId: ids.alice,
        grantBlob: blob,
        grantedBy: ids.alice,
      });
    });
    expect(
      await dbError(
        withContext(db, { principal: account(ids.alice), familyId: alice.familyId }, (tx) =>
          tx.insert(scopeKeyGrants).values({
            familyId: alice.familyId,
            scopeId,
            version: 1,
            grantee: 'account',
            granteeAccountId: ids.carol,
            grantBlob: blob,
            grantedBy: ids.alice,
          }),
        ),
      ),
    ).toMatch(/Grant key kind does not match scope kind/);
  });
});

describe('partition maintenance', () => {
  it('creates partitions idempotently and drops them after retention', async () => {
    const created = await withContext(db, { principal: { kind: 'system' } }, (tx) =>
      tx.execute<{ n: number }>(sql`select app.ensure_partitions() as n`),
    );
    expect(created.rows[0]!.n).toBe(0);
    const dropped = await withContext(db, { principal: { kind: 'system' } }, (tx) =>
      tx.execute<{ n: number }>(sql`select app.drop_expired_partitions(now() + interval '6 months') as n`),
    );
    expect(dropped.rows[0]!.n).toBe(3);
    const remaining = await admin.query<{ name: string }>(
      `select relname as name from pg_class where relname ~ '^security_events_y\\d{4}m\\d{2}$'`,
    );
    expect(remaining.rows).toEqual([]);
  });
});
