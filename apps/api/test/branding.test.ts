import type {
  FamilyBrandingResponse,
  ProblemDetails,
  PublicHousePage,
  PublicRescueSheet,
} from '@domusafe/contracts';
import { formatEtag } from '@domusafe/contracts';
import type { LightMyRequestResponse } from 'fastify';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, createTestApp, type TestApp } from './helpers.js';

const PASSWORD = 'una-password-lunga-42';
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const SECRET = 'WIFI-BODY-SEGRETO-MARCHIO';
const HOST = 'Casa Blu';

let ctx: TestApp;
let admin: pg.Pool;
let alice: Client;
let parent: Client;
let child: Client;
let aliceId: string;
let familyId: string;
let houseId: string;

function problem(response: LightMyRequestResponse): ProblemDetails {
  return response.json<ProblemDetails>();
}

function brandingUrl(): string {
  return `/api/v1/families/${familyId}/branding`;
}

function markBody(
  patch: Partial<{
    displayName: string | null;
    color: string | null;
    welcome: string | null;
    logoDataUrl: string | null;
  }> = {},
) {
  return {
    displayName: HOST,
    color: '#1F4E79',
    welcome: 'Benvenuti in casa',
    logoDataUrl: TINY_PNG,
    ...patch,
  };
}

beforeAll(async () => {
  ctx = await createTestApp();
  admin = new pg.Pool({ connectionString: ctx.database.adminUrl, max: 2 });
  alice = new Client(ctx.app);
  parent = new Client(ctx.app);
  child = new Client(ctx.app);
  aliceId = await alice.signUp('Alice Rossi', 'alice-marchio@example.test', PASSWORD);
  const parentId = await parent.signUp('Paolo Rossi', 'paolo-marchio@example.test', PASSWORD);
  const childId = await child.signUp('Chiara Rossi', 'chiara-marchio@example.test', PASSWORD);
  const created = await alice.create('/api/v1/families', {
    name: 'Famiglia Rossi',
    firstHouse: { name: 'Casa di città' },
  });
  expect(created.statusCode).toBe(201);
  const body = created.json<{ family: { id: string }; house: { id: string } }>();
  familyId = body.family.id;
  houseId = body.house.id;
  await admin.query(`insert into memberships (family_id, account_id, role) values ($1, $2, 'parent')`, [
    familyId,
    parentId,
  ]);
  await admin.query(`insert into memberships (family_id, account_id, role) values ($1, $2, 'child')`, [
    familyId,
    childId,
  ]);
  const guide = await alice.create(`/api/v1/families/${familyId}/houses/${houseId}/guide-entries`, {
    id: '01900000-0000-7000-8000-00000000b501',
    audience: 'guest',
    topic: 'wifi',
    title: 'Rete di casa',
    body: SECRET,
  });
  expect(guide.statusCode).toBe(201);
});

afterAll(async () => {
  await admin.end();
  await ctx.close();
});

describe('host mark', () => {
  it('stays closed below Premium, then appears on the public pages without vault text', async () => {
    const blocked = await alice.request('PUT', brandingUrl(), {
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: markBody(),
    });
    expect(blocked.statusCode).toBe(403);
    expect(problem(blocked).code).toBe('two_factor_setup_required');

    await alice.enableTwoFactor(PASSWORD);
    const plan = await alice.request('PUT', brandingUrl(), {
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: markBody(),
    });
    expect(plan.statusCode).toBe(403);
    expect(problem(plan).code).toBe('plan_required');
    expect(problem(plan).requiredPlan).toBe('premium');

    await admin.query(`update families set plan = 'advanced' where id = $1`, [familyId]);
    const advanced = await alice.request('GET', brandingUrl());
    expect(advanced.statusCode).toBe(403);
    expect(problem(advanced).requiredPlan).toBe('premium');

    await admin.query(
      `insert into premium_trials (account_id, family_id, started_at, ends_at)
       select $1, $2, t, t + interval '30 days' from (select now() as t) s`,
      [aliceId, familyId],
    );

    expect(problem(await child.request('GET', brandingUrl())).code).toBe('forbidden');
    const parentWrite = await parent.request('PUT', brandingUrl(), {
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: markBody(),
    });
    expect(problem(parentWrite).code).toBe('forbidden');

    const empty = await parent.request('GET', brandingUrl());
    expect(empty.statusCode).toBe(200);
    expect(empty.json<FamilyBrandingResponse>().branding).toBeNull();

    const digits = await alice.request('PUT', brandingUrl(), {
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: markBody({ welcome: 'codice 12345678' }),
    });
    expect(digits.statusCode).toBe(400);

    const saved = await alice.request('PUT', brandingUrl(), {
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: markBody(),
    });
    expect(saved.statusCode).toBe(201);
    expect(saved.headers.etag).toBe('"1"');
    const branding = saved.json<FamilyBrandingResponse>().branding;
    expect(branding).toMatchObject({
      familyId,
      displayName: HOST,
      color: '#1f4e79',
      welcome: 'Benvenuti in casa',
      logoDataUrl: TINY_PNG,
      version: 1,
    });

    const conflict = await alice.request('PUT', brandingUrl(), {
      headers: { 'idempotency-key': crypto.randomUUID(), 'if-match': '"9"' },
      body: markBody({ welcome: 'Di nuovo benvenuti' }),
    });
    expect(conflict.statusCode).toBe(409);
    expect(problem(conflict).currentVersion).toBe(1);

    const houseCode = await alice.create(`/api/v1/families/${familyId}/houses/${houseId}/publications`, {
      kind: 'house_page',
    });
    expect(houseCode.statusCode).toBe(201);
    const token = houseCode.json<{ token: string }>().token;
    const anon = new Client(ctx.app);
    const page = await anon.request('GET', `/api/v1/public/house-pages/${token}`, { csrf: false });
    expect(page.statusCode).toBe(200);
    const house = page.json<PublicHousePage>();
    expect(house.mark).toEqual({
      kind: 'host',
      displayName: HOST,
      color: '#1f4e79',
      welcome: 'Benvenuti in casa',
      logoDataUrl: TINY_PNG,
    });
    expect(page.body).not.toContain(SECRET);
    expect(page.body).not.toContain('DomuSafe');

    const rescueCode = await alice.create(`/api/v1/families/${familyId}/houses/${houseId}/publications`, {
      kind: 'rescue_sheet',
    });
    expect(rescueCode.statusCode).toBe(201);
    const rescueToken = rescueCode.json<{ token: string }>().token;
    const rescuePage = await anon.request('GET', `/api/v1/public/rescue-sheets/${rescueToken}`, {
      csrf: false,
    });
    expect(rescuePage.statusCode).toBe(200);
    expect(rescuePage.json<PublicRescueSheet>().mark.kind).toBe('host');
    expect(rescuePage.body).not.toContain(SECRET);

    await admin.query(
      `update premium_trials
       set started_at = now() - interval '31 days',
           ends_at = now() - interval '31 days' + interval '30 days'
       where account_id = $1`,
      [aliceId],
    );
    const hidden = await anon.request('GET', `/api/v1/public/house-pages/${token}`, { csrf: false });
    expect(hidden.json<PublicHousePage>().mark).toEqual({ kind: 'none' });
    expect(hidden.body).not.toContain(HOST);
    expect(hidden.body).not.toContain(SECRET);

    await admin.query(`update families set plan = 'free' where id = $1`, [familyId]);
    const product = await anon.request('GET', `/api/v1/public/house-pages/${token}`, { csrf: false });
    expect(product.json<PublicHousePage>().mark).toEqual({ kind: 'product' });
    expect(product.body).not.toContain(HOST);

    await admin.query(`update families set plan = 'premium' where id = $1`, [familyId]);
    const cleared = await alice.request('PUT', brandingUrl(), {
      headers: { 'idempotency-key': crypto.randomUUID(), 'if-match': formatEtag(1) },
      body: { displayName: null, color: null, welcome: null, logoDataUrl: null },
    });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json<FamilyBrandingResponse>().branding).toBeNull();
    const bare = await anon.request('GET', `/api/v1/public/house-pages/${token}`, { csrf: false });
    expect(bare.json<PublicHousePage>().mark).toEqual({ kind: 'none' });
  });
});
