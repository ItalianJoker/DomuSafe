import type {
  BarcodeProduct,
  MealPlanEntry,
  PantryItem,
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

function mealPlanUrl(suffix = ''): string {
  return `/api/v1/families/${familyId}/meal-plan${suffix}`;
}

function pantryUrl(suffix = ''): string {
  return `/api/v1/families/${familyId}/houses/${houseId}/pantry-items${suffix}`;
}

function barcodeUrl(code: string): string {
  return `/api/v1/families/${familyId}/barcode-products/${encodeURIComponent(code)}`;
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

describe('kitchen recipes, pantry, meal plan and shopping', () => {
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

  it('manages pantry stock and weekly meal plan on Free', async () => {
    const pantry = await alice.create(pantryUrl(), {
      name: 'Farina',
      quantity: 2,
      unit: 'kg',
      barcode: '8001234567890',
      expiryDate: '2027-01-15',
      minQuantity: 0.5,
    });
    expect(pantry.statusCode).toBe(201);
    const pantryBody = pantry.json<PantryItem>();
    expect(pantryBody.name).toBe('Farina');
    expect(pantryBody.barcode).toBe('8001234567890');
    expect(pantryBody.quantity).toBe(2);

    const remembered = await alice.request('GET', barcodeUrl('8001234567890'));
    expect(remembered.statusCode).toBe(200);
    expect(remembered.json<BarcodeProduct>().name).toBe('Farina');

    const low = await alice.request('PATCH', pantryUrl(`/${pantryBody.id}`), {
      headers: { 'if-match': formatEtag(pantryBody.version) },
      body: { quantity: 0.2 },
    });
    expect(low.statusCode).toBe(200);
    expect(low.json<PantryItem>().quantity).toBe(0.2);

    const lowList = await alice.request('GET', `${pantryUrl()}?lowStock=true`);
    expect(lowList.statusCode).toBe(200);
    expect(lowList.json<{ items: PantryItem[] }>().items.some((item) => item.id === pantryBody.id)).toBe(
      true,
    );

    const recipe = await alice.create(recipesUrl(), {
      title: 'Lasagne',
      servings: 6,
      ingredients: [{ name: 'Pasta', quantity: 500, unit: 'g', note: null }],
      steps: ['Assemblare', 'Cuocere'],
    });
    expect(recipe.statusCode).toBe(201);
    const recipeBody = recipe.json<Recipe>();

    const meal = await alice.create(mealPlanUrl(), {
      planDate: '2026-11-16',
      slot: 'dinner',
      houseId,
      recipeId: recipeBody.id,
      servings: 4,
      notes: 'Con contorno',
    });
    expect(meal.statusCode).toBe(201);
    const mealBody = meal.json<MealPlanEntry>();
    expect(mealBody.title).toBe('Lasagne');
    expect(mealBody.slot).toBe('dinner');
    expect(mealBody.recipeId).toBe(recipeBody.id);

    const freeText = await alice.create(mealPlanUrl(), {
      planDate: '2026-11-17',
      slot: 'lunch',
      houseId,
      title: 'Insalata mista',
    });
    expect(freeText.statusCode).toBe(201);

    const week = await alice.request(
      'GET',
      `${mealPlanUrl()}?from=2026-11-16&to=2026-11-22&houseId=${houseId}`,
    );
    expect(week.statusCode).toBe(200);
    const weekItems = week.json<{ items: MealPlanEntry[] }>().items;
    expect(weekItems).toHaveLength(2);

    const deleted = await alice.request('DELETE', mealPlanUrl(`/${mealBody.id}`), {
      headers: { 'if-match': formatEtag(mealBody.version) },
    });
    expect(deleted.statusCode).toBe(204);
  });
});
