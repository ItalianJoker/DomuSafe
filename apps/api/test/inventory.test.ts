import type { InventoryItem, ProblemDetails, Room, StorageUnit } from '@domusafe/contracts';
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

function houseUrl(suffix: string): string {
  return `/api/v1/families/${familyId}/houses/${houseId}${suffix}`;
}

beforeAll(async () => {
  ctx = await createTestApp();
  admin = new pg.Pool({ connectionString: ctx.database.adminUrl, max: 2 });
  alice = new Client(ctx.app);
  child = new Client(ctx.app);
  guest = new Client(ctx.app);
  await alice.signUp('Alice Inventario', 'alice-inventory@example.test', PASSWORD);
  const childId = await child.signUp('Chiara Inventario', 'chiara-inventory@example.test', PASSWORD);
  const guestId = await guest.signUp('Dario Inventario', 'dario-inventory@example.test', PASSWORD);
  const created = await alice.create('/api/v1/families', {
    name: 'Famiglia Inventario',
    firstHouse: { name: 'Casa di prova' },
  });
  expect(created.statusCode).toBe(201);
  const body = created.json<{ family: { id: string; plan: { tier: string } }; house: { id: string } }>();
  familyId = body.family.id;
  houseId = body.house.id;
  expect(body.family.plan.tier).toBe('free');
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
});

afterAll(async () => {
  await admin.end();
  await ctx.close();
});

describe('inventory', () => {
  it('stores rooms, closets and items with full-text search on the Free plan', async () => {
    const room = await alice.create(houseUrl('/rooms'), {
      name: 'Cucina',
      kind: 'kitchen',
      notes: 'Piano cottura a sinistra',
    });
    expect(room.statusCode).toBe(201);
    expect(room.headers.etag).toBe('"1"');
    const roomBody = room.json<Room>();
    expect(roomBody.name).toBe('Cucina');

    const wardrobe = await alice.create(houseUrl('/storage-units'), {
      roomId: roomBody.id,
      kind: 'wardrobe',
      name: 'Dispensa',
      notes: 'Scaffali alti',
    });
    expect(wardrobe.statusCode).toBe(201);
    const wardrobeBody = wardrobe.json<StorageUnit>();

    const shelf = await alice.create(houseUrl('/storage-units'), {
      roomId: roomBody.id,
      parentId: wardrobeBody.id,
      kind: 'shelf',
      name: 'Mensola superiore',
    });
    expect(shelf.statusCode).toBe(201);

    const item = await alice.create(houseUrl('/inventory-items'), {
      roomId: roomBody.id,
      storageUnitId: wardrobeBody.id,
      name: 'Frullatore immersione',
      tags: ['elettrodomestico', 'cucina'],
      warrantyUntil: '2028-06-01',
      warrantyNotes: 'Garanzia due anni dal negozio',
      photoCaption: 'Foto sul ripiano',
      notes: 'Cavo riposto nella scatola',
    });
    expect(item.statusCode).toBe(201);
    const itemBody = item.json<InventoryItem>();
    expect(itemBody.tags).toEqual(['elettrodomestico', 'cucina']);
    expect(itemBody.warrantyUntil).toBe('2028-06-01');

    const updated = await alice.request('PATCH', houseUrl(`/inventory-items/${itemBody.id}`), {
      body: { name: 'Frullatore' },
      headers: { 'if-match': '"1"' },
    });
    expect(updated.statusCode).toBe(200);
    const stale = await alice.request('PATCH', houseUrl(`/inventory-items/${itemBody.id}`), {
      body: { notes: 'Aggiornato' },
      headers: { 'if-match': '"1"' },
    });
    expect(stale.statusCode).toBe(409);
    expect(problem(stale).code).toBe('version_conflict');

    const search = await alice.request('GET', houseUrl('/inventory/search?q=frullatore'));
    expect(search.statusCode).toBe(200);
    const hits = search.json<{ items: { title: string; resourceType: string }[] }>();
    expect(hits.items.some((hit) => hit.resourceType === 'inventory_items')).toBe(true);
    expect(hits.items.some((hit) => hit.title.toLowerCase().includes('frullatore'))).toBe(true);

    const tagged = await alice.request('GET', houseUrl('/inventory/search?q=cucina&tag=elettrodomestico'));
    expect(tagged.statusCode).toBe(200);
    expect(tagged.json<{ items: unknown[] }>().items.length).toBeGreaterThan(0);

    const childList = await child.request('GET', houseUrl('/rooms'));
    expect(childList.statusCode).toBe(200);
    expect(childList.json<{ items: Room[] }>().items.length).toBeGreaterThan(0);

    const childWrite = await child.create(houseUrl('/rooms'), { name: 'Bagno', kind: 'bathroom' });
    expect(childWrite.statusCode).toBe(403);

    const guestRooms = await guest.request('GET', houseUrl('/rooms'));
    expect(guestRooms.statusCode).toBe(403);

    const guestItems = await guest.request('GET', houseUrl('/inventory-items'));
    expect(guestItems.statusCode).toBe(403);
  });
});
