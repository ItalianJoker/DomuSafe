import type {
  ProblemDetails,
  Recipe,
  RecipeImport,
  ShoppingItem,
  ShoppingList,
  Store,
} from '@domusafe/contracts';
import { formatEtag } from '@domusafe/contracts';
import type { LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, createTestApp, type TestApp } from './helpers.js';

const PASSWORD = 'una-password-lunga-42';

let ctx: TestApp;
let alice: Client;
let familyId: string;
let houseId: string;

function problem(response: LightMyRequestResponse): ProblemDetails {
  return response.json<ProblemDetails>();
}

function recipesUrl(suffix = ''): string {
  return `/api/v1/families/${familyId}/recipes${suffix}`;
}

function storesUrl(suffix = ''): string {
  return `/api/v1/families/${familyId}/stores${suffix}`;
}

function listsUrl(suffix = ''): string {
  return `/api/v1/families/${familyId}/shopping-lists${suffix}`;
}

beforeAll(async () => {
  ctx = await createTestApp();
  alice = new Client(ctx.app);
  await alice.signUp('Alice Cucina', 'alice-kitchen@example.test', PASSWORD);
  const created = await alice.create('/api/v1/families', {
    name: 'Famiglia Cucina',
    firstHouse: { name: 'Casa cucina' },
  });
  expect(created.statusCode).toBe(201);
  const body = created.json<{ family: { id: string; plan: { tier: string } }; house: { id: string } }>();
  familyId = body.family.id;
  houseId = body.house.id;
  expect(body.family.plan.tier).toBe('free');
});

afterAll(async () => {
  await ctx.close();
});

describe('kitchen recipes and shopping', () => {
  it('creates recipes and shopping lists by store and aisle on Free', async () => {
    const recipe = await alice.create(recipesUrl(), {
      title: 'Pasta al pomodoro',
      description: 'Piatto semplice',
      servings: 4,
      prepMinutes: 10,
      cookMinutes: 15,
      ingredients: [
        { name: 'Spaghetti', quantity: 400, unit: 'g', note: null },
        { name: 'Pomodori', quantity: 6, unit: null, note: 'maturi' },
      ],
      steps: ['Lessare la pasta', 'Preparare il sugo', 'Mescolare'],
      tags: ['primo', 'veloce'],
    });
    expect(recipe.statusCode).toBe(201);
    const recipeBody = recipe.json<Recipe>();
    expect(recipeBody.title).toBe('Pasta al pomodoro');
    expect(recipeBody.ingredients).toHaveLength(2);
    expect(recipeBody.steps).toEqual(['Lessare la pasta', 'Preparare il sugo', 'Mescolare']);

    const listed = await alice.request('GET', recipesUrl());
    expect(listed.statusCode).toBe(200);
    expect(listed.json<{ items: Recipe[] }>().items.some((item) => item.id === recipeBody.id)).toBe(true);

    const patched = await alice.request('PATCH', recipesUrl(`/${recipeBody.id}`), {
      headers: { 'if-match': formatEtag(recipeBody.version) },
      body: { cookMinutes: 20 },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json<Recipe>().cookMinutes).toBe(20);

    const blockedImport = await alice.create(`/api/v1/families/${familyId}/recipe-imports`, {
      url: 'http://127.0.0.1/recipe',
    });
    expect(blockedImport.statusCode).toBe(202);
    const importBody = blockedImport.json<RecipeImport>();
    expect(importBody.status).toBe('failed');
    expect(importBody.errorCode).toBe('host_blocked');

    const store = await alice.create(storesUrl(), {
      name: 'Mercato sotto casa',
      aisleOrder: ['frutta', 'latte', 'pane'],
    });
    expect(store.statusCode).toBe(201);
    const storeBody = store.json<Store>();
    expect(storeBody.aisleOrder).toEqual(['frutta', 'latte', 'pane']);

    const list = await alice.create(listsUrl(), {
      name: 'Spesa di sabato',
      houseId,
      storeId: storeBody.id,
    });
    expect(list.statusCode).toBe(201);
    const listBody = list.json<ShoppingList>();
    expect(listBody.storeId).toBe(storeBody.id);
    expect(listBody.houseId).toBe(houseId);

    const item = await alice.create(listsUrl(`/${listBody.id}/items`), {
      name: 'Mele',
      quantity: 1.5,
      unit: 'kg',
      aisle: 'frutta',
    });
    expect(item.statusCode).toBe(201);
    const itemBody = item.json<ShoppingItem>();
    expect(itemBody.aisle).toBe('frutta');
    expect(itemBody.checkedAt).toBeNull();

    const checked = await alice.request('POST', listsUrl(`/${listBody.id}/items/${itemBody.id}/check`), {
      body: { checked: true },
      headers: {
        'idempotency-key': crypto.randomUUID(),
        'if-match': formatEtag(itemBody.version),
      },
    });
    expect(checked.statusCode).toBe(200);
    expect(checked.json<ShoppingItem>().checkedAt).not.toBeNull();

    const openOnly = await alice.request('GET', listsUrl(`/${listBody.id}/items?openOnly=true`));
    expect(openOnly.statusCode).toBe(200);
    expect(openOnly.json<{ items: ShoppingItem[] }>().items).toHaveLength(0);
  });

  it('rejects recipe writes without If-Match', async () => {
    const recipe = await alice.create(recipesUrl(), {
      title: 'Brodo',
      ingredients: [{ name: 'Acqua', quantity: 1, unit: 'l', note: null }],
      steps: ['Bollire'],
    });
    expect(recipe.statusCode).toBe(201);
    const body = recipe.json<Recipe>();
    const response = await alice.request('PATCH', recipesUrl(`/${body.id}`), {
      body: { title: 'Brodo di verdure' },
    });
    expect(response.statusCode).toBe(428);
    expect(problem(response).code).toBe('precondition_required');
  });
});
