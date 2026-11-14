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

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('inventory', () => {
  it('stores day evening and lights-off room photo sets on the Free plan', async () => {
    const room = await alice.create(houseUrl('/rooms'), {
      name: 'Soggiorno foto',
      kind: 'living',
      photoDayDataUrl: TINY_PNG,
      photoEveningStorageRef: 'family/demo/evening.webp',
    });
    expect(room.statusCode).toBe(201);
    const created = room.json<Room>();
    expect(created.photoDayDataUrl).toBe(TINY_PNG);
    expect(created.photoEveningDataUrl).toBeNull();
    expect(created.photoEveningStorageRef).toBe('family/demo/evening.webp');
    expect(created.photoLightsOffDataUrl).toBeNull();

    const patched = await alice.request('PATCH', houseUrl(`/rooms/${created.id}`), {
      body: {
        photoLightsOffDataUrl: TINY_PNG,
        photoEveningDataUrl: TINY_PNG,
        photoEveningStorageRef: null,
      },
      headers: { 'if-match': '"1"' },
    });
    expect(patched.statusCode).toBe(200);
    const body = patched.json<Room>();
    expect(body.photoDayDataUrl).toBe(TINY_PNG);
    expect(body.photoEveningDataUrl).toBe(TINY_PNG);
    expect(body.photoEveningStorageRef).toBeNull();
    expect(body.photoLightsOffDataUrl).toBe(TINY_PNG);
    expect(body.version).toBe(2);
  });

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
    expect(roomBody.photoDayDataUrl).toBeNull();
    expect(roomBody.photoEveningDataUrl).toBeNull();
    expect(roomBody.photoLightsOffDataUrl).toBeNull();

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

    const filtered = await alice.request('POST', houseUrl('/inventory/search'), {
      body: {
        filter: {
          kind: 'group',
          op: 'and',
          children: [
            { kind: 'text', q: 'frullatore' },
            {
              kind: 'group',
              op: 'or',
              children: [
                { kind: 'tags', tags: ['elettrodomestico'], mode: 'and' },
                { kind: 'types', types: ['rooms'] },
              ],
            },
          ],
        },
      },
    });
    expect(filtered.statusCode).toBe(200);
    expect(
      filtered
        .json<{ items: { resourceType: string }[] }>()
        .items.some((hit) => hit.resourceType === 'inventory_items'),
    ).toBe(true);

    const orTags = await alice.request('POST', houseUrl('/inventory/search'), {
      body: {
        filter: {
          kind: 'tags',
          tags: ['elettrodomestico', 'inesistente'],
          mode: 'or',
        },
      },
    });
    expect(orTags.statusCode).toBe(200);
    expect(orTags.json<{ items: unknown[] }>().items.length).toBeGreaterThan(0);

    const andMiss = await alice.request('POST', houseUrl('/inventory/search'), {
      body: {
        filter: {
          kind: 'tags',
          tags: ['elettrodomestico', 'inesistente'],
          mode: 'and',
        },
      },
    });
    expect(andMiss.statusCode).toBe(200);
    expect(andMiss.json<{ items: unknown[] }>().items).toEqual([]);

    const saved = await alice.create(`/api/v1/families/${familyId}/saved-filters`, {
      name: 'Attrezzi cucina',
      filter: {
        kind: 'group',
        op: 'and',
        children: [
          { kind: 'text', q: 'frullatore' },
          { kind: 'tags', tags: ['cucina'], mode: 'and' },
        ],
      },
    });
    expect(saved.statusCode).toBe(201);
    expect(saved.headers.etag).toBe('"1"');
    const savedBody = saved.json<{ id: string; pinnedPosition: number; version: number }>();
    expect(savedBody.pinnedPosition).toBe(1);

    const listed = await alice.request('GET', `/api/v1/families/${familyId}/saved-filters`);
    expect(listed.statusCode).toBe(200);
    expect(listed.json<{ items: unknown[] }>().items).toHaveLength(1);

    for (let index = 2; index <= 5; index += 1) {
      const extra = await alice.create(`/api/v1/families/${familyId}/saved-filters`, {
        name: `Filtro ${String(index)}`,
        filter: { kind: 'text', q: `prova ${String(index)}` },
      });
      expect(extra.statusCode).toBe(201);
    }
    const sixth = await alice.create(`/api/v1/families/${familyId}/saved-filters`, {
      name: 'Troppo',
      filter: { kind: 'text', q: 'eccesso' },
    });
    expect(sixth.statusCode).toBe(422);
    expect(problem(sixth).code).toBe('domain_rule_violated');

    const childList = await child.request('GET', houseUrl('/rooms'));
    expect(childList.statusCode).toBe(200);
    expect(childList.json<{ items: Room[] }>().items.length).toBeGreaterThan(0);

    const childFilters = await child.request('GET', `/api/v1/families/${familyId}/saved-filters`);
    expect(childFilters.statusCode).toBe(200);
    expect(childFilters.json<{ items: unknown[] }>().items).toEqual([]);

    const childWrite = await child.create(houseUrl('/rooms'), { name: 'Bagno', kind: 'bathroom' });
    expect(childWrite.statusCode).toBe(403);

    const guestRooms = await guest.request('GET', houseUrl('/rooms'));
    expect(guestRooms.statusCode).toBe(403);

    const guestItems = await guest.request('GET', houseUrl('/inventory-items'));
    expect(guestItems.statusCode).toBe(403);

    const guestFilters = await guest.request('GET', `/api/v1/families/${familyId}/saved-filters`);
    expect(guestFilters.statusCode).toBe(403);
  });
});
