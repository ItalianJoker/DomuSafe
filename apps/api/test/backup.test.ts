import type { ExportCatalog, ExportRecordsPage, ProblemDetails, Resident } from '@domusafe/contracts';
import { uuidv7 } from '@domusafe/crypto';
import type { LightMyRequestResponse } from 'fastify';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, createTestApp, type TestApp } from './helpers.js';

const PASSWORD = 'una-password-lunga-42';

let ctx: TestApp;
let admin: pg.Pool;
let alice: Client;
let child: Client;
let guest: Client;
let familyId: string;
let houseId: string;

function problem(response: LightMyRequestResponse): ProblemDetails {
  return response.json<ProblemDetails>();
}

function exportUrl(suffix: string): string {
  return `/api/v1/families/${familyId}/export${suffix}`;
}

beforeAll(async () => {
  ctx = await createTestApp();
  admin = new pg.Pool({ connectionString: ctx.database.adminUrl, max: 2 });
  alice = new Client(ctx.app);
  child = new Client(ctx.app);
  guest = new Client(ctx.app);
  await alice.signUp('Alice Backup', 'alice-backup@example.test', PASSWORD);
  const childId = await child.signUp('Chiara Backup', 'child-backup@example.test', PASSWORD);
  const guestId = await guest.signUp('Ospite Backup', 'guest-backup@example.test', PASSWORD);
  const created = await alice.create('/api/v1/families', {
    name: 'Famiglia Backup',
    firstHouse: { name: 'Casa export' },
  });
  expect(created.statusCode).toBe(201);
  const body = created.json<{ family: { id: string }; house: { id: string } }>();
  familyId = body.family.id;
  houseId = body.house.id;
  await admin.query(`insert into memberships (family_id, account_id, role) values ($1, $2, 'child')`, [
    familyId,
    childId,
  ]);
  const membership = await admin.query<{ id: string }>(
    `insert into memberships (family_id, account_id, role, all_houses, all_residents, expires_at)
     values ($1, $2, 'guest', false, false, now() + interval '14 days') returning id`,
    [familyId, guestId],
  );
  await admin.query(
    `insert into membership_houses (membership_id, family_id, house_id) values ($1, $2, $3)`,
    [membership.rows[0]!.id, familyId, houseId],
  );
  const resident = await alice.create(`/api/v1/families/${familyId}/residents`, {
    displayName: 'Luca',
    kind: 'adult',
    houseIds: [houseId],
  });
  expect(resident.statusCode).toBe(201);
  expect(resident.json<Resident>().displayName).toBe('Luca');
  const room = await alice.create(`/api/v1/families/${familyId}/houses/${houseId}/rooms`, {
    name: 'Soggiorno',
    kind: 'living',
  });
  expect(room.statusCode).toBe(201);
  const utility = await alice.create(`/api/v1/families/${familyId}/houses/${houseId}/utilities`, {
    id: uuidv7(),
    kind: 'electricity',
    providerName: 'Fornitore luce',
  });
  expect(utility.statusCode).toBe(201);
  const task = await alice.create(`/api/v1/families/${familyId}/houses/${houseId}/maintenance-tasks`, {
    category: 'heating',
    title: 'Controllo caldaia',
    nextDueDate: '2026-12-01',
  });
  expect(task.statusCode).toBe(201);
});

afterAll(async () => {
  await admin.end();
  await ctx.close();
});

describe('backup export', () => {
  it('returns a catalog and pages family rows with sealed fields left encrypted', async () => {
    const catalog = await alice.request('GET', exportUrl('/catalog'));
    expect(catalog.statusCode).toBe(200);
    const catalogBody = catalog.json<ExportCatalog>();
    expect(catalogBody.modules.some((item) => item.module === 'residents' && item.readable)).toBe(true);
    expect(catalogBody.modules.some((item) => item.module === 'utilities' && item.readable)).toBe(true);

    const first = await alice.request('GET', exportUrl('/records?limit=2'));
    expect(first.statusCode).toBe(200);
    const page = first.json<ExportRecordsPage>();
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.length).toBeLessThanOrEqual(2);
    expect(page.nextCursor).not.toBeNull();

    const residents = await alice.request('GET', exportUrl('/records?module=residents&limit=50'));
    expect(residents.statusCode).toBe(200);
    const residentPage = residents.json<ExportRecordsPage>();
    expect(residentPage.items.some((item) => item.table === 'residents')).toBe(true);
    expect(residentPage.items[0]?.data.displayName).toBe('Luca');

    const utilities = await alice.request('GET', exportUrl('/records?module=utilities&limit=50'));
    expect(utilities.statusCode).toBe(200);
    const utilityPage = utilities.json<ExportRecordsPage>();
    expect(utilityPage.items[0]?.data.providerName).toBe('Fornitore luce');
    expect(utilityPage.items[0]?.data.sealed).toBeNull();

    const deadlines = await alice.request('GET', exportUrl('/records?module=deadlines&limit=50'));
    expect(deadlines.statusCode).toBe(200);
    expect(
      deadlines.json<ExportRecordsPage>().items.some((item) => item.data.title === 'Controllo caldaia'),
    ).toBe(true);

    let cursor: string | null = page.nextCursor;
    let pages = 1;
    while (cursor !== null && pages < 40) {
      const next = await alice.request(
        'GET',
        `${exportUrl('/records')}?limit=5&cursor=${encodeURIComponent(cursor)}`,
      );
      expect(next.statusCode).toBe(200);
      const nextPage = next.json<ExportRecordsPage>();
      cursor = nextPage.nextCursor;
      pages += 1;
    }
    expect(cursor).toBeNull();
  });

  it('lets a child export without utilities metadata', async () => {
    const catalog = await child.request('GET', exportUrl('/catalog'));
    expect(catalog.statusCode).toBe(200);
    const modules = catalog.json<ExportCatalog>().modules;
    expect(modules.find((item) => item.module === 'utilities')?.readable).toBe(false);
    expect(modules.find((item) => item.module === 'residents')?.readable).toBe(true);

    const utilities = await child.request('GET', exportUrl('/records?module=utilities'));
    expect(utilities.statusCode).toBe(200);
    expect(utilities.json<ExportRecordsPage>().items).toEqual([]);
  });

  it('refuses guests who lack export permission', async () => {
    const response = await guest.request('GET', exportUrl('/catalog'));
    expect(response.statusCode).toBe(403);
    expect(problem(response).code).toBe('forbidden');
  });

  it('rejects a broken cursor', async () => {
    const response = await alice.request('GET', exportUrl('/records?cursor=not-a-cursor'));
    expect(response.statusCode).toBe(400);
    expect(problem(response).code).toBe('cursor_invalid');
  });
});
