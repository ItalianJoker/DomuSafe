import { randomUUID } from 'node:crypto';
import type { Family, House, Me, Membership, ProblemDetails } from '@domusafe/contracts';
import type { LightMyRequestResponse } from 'fastify';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, ORIGIN, createTestApp, type TestApp } from './helpers.js';

const PASSWORD = 'una-password-lunga-42';

let ctx: TestApp;
let admin: pg.Pool;
let alice: Client;
let bob: Client;
let aliceId: string;
let bobId: string;
let family: Family;
let firstHouse: House;

function problem(response: LightMyRequestResponse): ProblemDetails {
  expect(String(response.headers['content-type'])).toContain('application/problem+json');
  return response.json<ProblemDetails>();
}

beforeAll(async () => {
  ctx = await createTestApp();
  admin = new pg.Pool({ connectionString: ctx.database.adminUrl, max: 2 });
  alice = new Client(ctx.app);
  bob = new Client(ctx.app);
  aliceId = await alice.signUp('Alice Rossi', 'alice@example.test', PASSWORD);
  bobId = await bob.signUp('Bob Bianchi', 'bob@example.test', PASSWORD);
});

afterAll(async () => {
  await admin.end();
  await ctx.close();
});

describe('system and contract', () => {
  it('answers health and readiness probes', async () => {
    const client = new Client(ctx.app);
    expect((await client.request('GET', '/api/v1/health')).json()).toEqual({ status: 'ok' });
    expect((await client.request('GET', '/api/v1/ready')).statusCode).toBe(200);
  });

  it('publishes the OpenAPI 3.1 document and the documentation UI', async () => {
    const client = new Client(ctx.app);
    const doc = (await client.request('GET', '/api/v1/openapi.json')).json<{
      openapi: string;
      paths: Record<string, unknown>;
    }>();
    expect(doc.openapi).toBe('3.1.0');
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining([
        '/api/v1/families',
        '/api/v1/families/{familyId}/houses/{houseId}',
        '/api/v1/me',
      ]),
    );
    expect((await client.request('GET', '/api/v1/docs/')).statusCode).toBe(200);
  });

  it('answers unknown routes and anonymous calls with problem details', async () => {
    const client = new Client(ctx.app);
    expect(problem(await client.request('GET', '/api/v1/nope')).code).toBe('not_found');
    const unauthenticated = problem(await client.request('GET', '/api/v1/me'));
    expect(unauthenticated).toMatchObject({
      status: 401,
      code: 'unauthenticated',
      type: 'urn:domusafe:problem:unauthenticated',
    });
    expect(unauthenticated.title).toBe('Accesso richiesto');
    const english = problem(
      await client.request('GET', '/api/v1/me', { headers: { 'accept-language': 'en-GB,en;q=0.9' } }),
    );
    expect(english.title).toBe('Sign-in required');
  });

  it('sends security headers', async () => {
    const response = await new Client(ctx.app).request('GET', '/api/v1/health');
    expect(response.headers['content-security-policy']).toContain("default-src 'none'");
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['x-request-id']).toBeTypeOf('string');
  });
});

describe('account', () => {
  it('creates the profile at registration', async () => {
    const me = (await alice.request('GET', '/api/v1/me')).json<Me>();
    expect(me).toMatchObject({
      accountId: aliceId,
      email: 'alice@example.test',
      displayName: 'Alice Rossi',
      locale: 'it',
      theme: 'system',
      twoFactorEnabled: false,
      primaryFamilyId: null,
      families: [],
    });
  });

  it('updates display name and theme', async () => {
    const me = (await alice.request('PATCH', '/api/v1/me/profile', { body: { theme: 'dark' } })).json<Me>();
    expect(me.theme).toBe('dark');
  });
});

describe('CSRF and idempotency', () => {
  it('rejects writes without the anti-CSRF header or from foreign origins', async () => {
    const body = { name: 'Rossi', firstHouse: { name: 'Casa' } };
    const missing = await alice.request('POST', '/api/v1/families', {
      body,
      csrf: false,
      headers: { 'idempotency-key': randomUUID() },
    });
    expect(problem(missing).code).toBe('csrf_rejected');
    const foreign = await alice.request('POST', '/api/v1/families', {
      body,
      headers: { origin: 'https://evil.example', 'idempotency-key': randomUUID() },
    });
    expect(problem(foreign).code).toBe('csrf_rejected');
  });

  it('requires an Idempotency-Key on creations', async () => {
    const response = await alice.request('POST', '/api/v1/families', {
      body: { name: 'Rossi', firstHouse: { name: 'Casa' } },
    });
    expect(problem(response)).toMatchObject({
      code: 'validation_failed',
      errors: [{ path: 'headers.idempotency-key' }],
    });
  });

  it('validates bodies strictly', async () => {
    const response = await alice.create('/api/v1/families', {
      name: '',
      firstHouse: { name: 'Casa' },
      extra: true,
    });
    const body = problem(response);
    expect(body.code).toBe('validation_failed');
    expect(body.errors?.length).toBeGreaterThan(0);
  });

  it('creates the family once and replays the stored response', async () => {
    const key = randomUUID();
    const body = { name: 'Famiglia Rossi', firstHouse: { name: 'Casa di città' } };
    const first = await alice.create('/api/v1/families', body, key);
    expect(first.statusCode).toBe(201);
    const created = first.json<{ family: Family; house: House }>();
    family = created.family;
    firstHouse = created.house;
    expect(first.headers.location).toBe(`/api/v1/families/${family.id}`);
    expect(first.headers.etag).toBe('"1"');
    expect(family).toMatchObject({
      name: 'Famiglia Rossi',
      ownerAccountId: aliceId,
      role: 'admin',
      timezone: 'Europe/Rome',
      baseCurrency: 'EUR',
      plan: { tier: 'free', source: 'paid', trialEndsAt: null, watermark: true },
    });

    const replay = await alice.create('/api/v1/families', body, key);
    expect(replay.statusCode).toBe(201);
    expect(replay.headers['idempotent-replayed']).toBe('true');
    expect(replay.json()).toEqual(created);

    const reused = await alice.create('/api/v1/families', { ...body, name: 'Altra' }, key);
    expect(problem(reused).code).toBe('idempotency_key_reused');

    const families = (await alice.request('GET', '/api/v1/families')).json<{ items: Family[] }>();
    expect(families.items.map((item) => item.id)).toEqual([family.id]);
    const me = (await alice.request('GET', '/api/v1/me')).json<Me>();
    expect(me.primaryFamilyId).toBe(family.id);
  });
});

describe('houses, plan limits and two-factor authentication', () => {
  const housesUrl = (): string => `/api/v1/families/${family.id}/houses`;

  it('lists and reads houses with ETags', async () => {
    const page = (await alice.request('GET', housesUrl())).json<{
      items: House[];
      nextCursor: string | null;
    }>();
    expect(page).toEqual({ items: [firstHouse], nextCursor: null });
    const one = await alice.request('GET', `${housesUrl()}/${firstHouse.id}`);
    expect(one.headers.etag).toBe('"1"');
  });

  it('requires two-factor authentication for administration', async () => {
    const response = await alice.create(housesUrl(), { name: 'Casa al mare' });
    expect(problem(response).code).toBe('two_factor_setup_required');
  });

  it('enforces the Free plan house limit', async () => {
    await alice.enableTwoFactor(PASSWORD);
    const response = await alice.create(housesUrl(), { name: 'Casa al mare' });
    expect(problem(response)).toMatchObject({ code: 'plan_limit_reached', limit: 1, usage: 1 });
  });

  it('allows three houses on Advanced and rejects the fourth', async () => {
    await admin.query(`update families set plan = 'advanced', plan_source = 'operator' where id = $1`, [
      family.id,
    ]);
    expect((await alice.create(housesUrl(), { name: 'Casa al mare', city: 'Rimini' })).statusCode).toBe(201);
    expect((await alice.create(housesUrl(), { name: 'Baita' })).statusCode).toBe(201);
    expect(problem(await alice.create(housesUrl(), { name: 'Quarta casa' }))).toMatchObject({
      code: 'plan_limit_reached',
      limit: 3,
    });
  });

  it('paginates with an opaque cursor', async () => {
    const first = (await alice.request('GET', `${housesUrl()}?limit=2`)).json<{
      items: House[];
      nextCursor: string;
    }>();
    expect(first.items).toHaveLength(2);
    const second = (await alice.request('GET', `${housesUrl()}?limit=2&cursor=${first.nextCursor}`)).json<{
      items: House[];
      nextCursor: string | null;
    }>();
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    expect(problem(await alice.request('GET', `${housesUrl()}?cursor=garbage`)).code).toBe('cursor_invalid');
  });

  it('applies optimistic concurrency on updates', async () => {
    const url = `${housesUrl()}/${firstHouse.id}`;
    expect(problem(await alice.request('PATCH', url, { body: { name: 'Casa principale' } })).code).toBe(
      'precondition_required',
    );
    expect(
      problem(
        await alice.request('PATCH', url, {
          body: { name: 'Casa principale' },
          headers: { 'if-match': '"9"' },
        }),
      ),
    ).toMatchObject({ code: 'version_conflict', currentVersion: 1 });
    const updated = await alice.request('PATCH', url, {
      body: { name: 'Casa principale' },
      headers: { 'if-match': '"1"' },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.headers.etag).toBe('"2"');
    expect(updated.json<House>()).toMatchObject({ name: 'Casa principale', version: 2 });
  });

  it('moves a house to the trash with a revision and an audit event', async () => {
    const houses = (await alice.request('GET', housesUrl())).json<{ items: House[] }>().items;
    const baita = houses.find((house) => house.name === 'Baita');
    expect(baita).toBeDefined();
    const deleted = await alice.request('DELETE', `${housesUrl()}/${baita!.id}`, {
      headers: { 'if-match': '"1"' },
    });
    expect(deleted.statusCode).toBe(204);
    expect((await alice.request('GET', `${housesUrl()}/${baita!.id}`)).statusCode).toBe(404);
    const revisions = await admin.query<{ op: string }>(
      'select op from revisions where resource_id = $1 order by version',
      [baita!.id],
    );
    expect(revisions.rows.map((row) => row.op)).toEqual(['create', 'delete']);
    const audit = await admin.query<{ action: string }>(
      `select action from audit_events where family_id = $1 and resource_id = $2 order by occurred_at`,
      [family.id, baita!.id],
    );
    expect(audit.rows.map((row) => row.action)).toEqual(['tenancy.house.created', 'tenancy.house.deleted']);
  });
});

describe('members and isolation', () => {
  const membersUrl = (): string => `/api/v1/families/${family.id}/members`;

  it('hides families from non-members', async () => {
    expect(problem(await bob.request('GET', `/api/v1/families/${family.id}`)).code).toBe('not_found');
    expect(problem(await bob.request('GET', `/api/v1/families/${family.id}/houses`)).code).toBe('not_found');
  });

  it('lets a parent read but not administer', async () => {
    await admin.query(`insert into memberships (family_id, account_id, role) values ($1, $2, 'parent')`, [
      family.id,
      bobId,
    ]);
    const asBob = (await bob.request('GET', `/api/v1/families/${family.id}`)).json<Family>();
    expect(asBob).toMatchObject({ role: 'parent', plan: { tier: 'advanced', watermark: false } });
    expect(
      problem(await bob.create(`/api/v1/families/${family.id}/houses`, { name: 'Casa di Bob' })).code,
    ).toBe('forbidden');
    const members = (await bob.request('GET', membersUrl())).json<{ items: Membership[] }>().items;
    expect(members.map((member) => [member.displayName, member.role, member.isOwner])).toEqual([
      ['Alice Rossi', 'admin', true],
      ['Bob Bianchi', 'parent', false],
    ]);
  });

  it('applies membership rules and restricts guests to their houses', async () => {
    const members = (await alice.request('GET', membersUrl())).json<{ items: Membership[] }>().items;
    const bobMember = members.find((member) => member.accountId === bobId)!;
    const aliceMember = members.find((member) => member.accountId === aliceId)!;

    const noExpiry = await alice.request('PATCH', `${membersUrl()}/${bobMember.id}`, {
      body: { role: 'guest', houseIds: [firstHouse.id] },
      headers: { 'if-match': `"${String(bobMember.version)}"` },
    });
    expect(problem(noExpiry).code).toBe('domain_rule_violated');

    const ownerDowngrade = await alice.request('PATCH', `${membersUrl()}/${aliceMember.id}`, {
      body: { role: 'parent' },
      headers: { 'if-match': `"${String(aliceMember.version)}"` },
    });
    expect(problem(ownerDowngrade).code).toBe('domain_rule_violated');

    const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const guest = await alice.request('PATCH', `${membersUrl()}/${bobMember.id}`, {
      body: { role: 'guest', expiresAt, houseIds: [firstHouse.id] },
      headers: { 'if-match': `"${String(bobMember.version)}"` },
    });
    expect(guest.statusCode).toBe(200);
    expect(guest.json<Membership>()).toMatchObject({
      role: 'guest',
      allHouses: false,
      allResidents: false,
      houseIds: [firstHouse.id],
      expiresAt,
    });
    const bobHouses = (await bob.request('GET', `/api/v1/families/${family.id}/houses`)).json<{
      items: House[];
    }>();
    expect(bobHouses.items.map((house) => house.id)).toEqual([firstHouse.id]);
  });

  it('removes a member and cuts access', async () => {
    const members = (await alice.request('GET', membersUrl())).json<{ items: Membership[] }>().items;
    const bobMember = members.find((member) => member.accountId === bobId)!;
    const removed = await alice.request('DELETE', `${membersUrl()}/${bobMember.id}`, {
      headers: { 'if-match': `"${String(bobMember.version)}"` },
    });
    expect(removed.statusCode).toBe(204);
    expect(problem(await bob.request('GET', `/api/v1/families/${family.id}`)).code).toBe('not_found');
  });

  it('refuses to point the profile at a house of another family', async () => {
    const bobFamily = (
      await bob.create('/api/v1/families', { name: 'Famiglia Bianchi', firstHouse: { name: 'Casa Bianchi' } })
    ).json<{ family: Family; house: House }>();
    const response = await alice.request('PATCH', '/api/v1/me/profile', {
      body: { lastFamilyId: family.id, lastHouseId: bobFamily.house.id },
    });
    expect(problem(response)).toMatchObject({
      code: 'validation_failed',
      errors: [{ path: 'body.lastHouseId' }],
    });
    const ok = await alice.request('PATCH', '/api/v1/me/profile', {
      body: { lastFamilyId: family.id, lastHouseId: firstHouse.id },
    });
    expect(ok.json<Me>()).toMatchObject({ lastFamilyId: family.id, lastHouseId: firstHouse.id });
  });
});

describe('rate limiting', () => {
  it('answers 429 with Retry-After once the limit is exceeded', async () => {
    const limited = await createTestApp({ rateLimitPerMinute: 2 });
    try {
      const client = new Client(limited.app);
      await client.request('GET', '/api/v1/health');
      await client.request('GET', '/api/v1/health');
      const third = await client.request('GET', '/api/v1/health');
      expect(problem(third).code).toBe('rate_limited');
      expect(Number(third.headers['retry-after'])).toBeGreaterThan(0);
    } finally {
      await limited.close();
    }
  });

  it('keeps Better Auth behind the same origin allow-list', async () => {
    const client = new Client(ctx.app);
    const response = await client.request('POST', '/api/auth/sign-in/email', {
      body: { email: 'alice@example.test', password: PASSWORD },
      headers: { origin: 'https://evil.example' },
    });
    expect(problem(response).code).toBe('csrf_rejected');
    const allowed = await client.request('POST', '/api/auth/sign-in/email', {
      body: { email: 'bob@example.test', password: PASSWORD },
      headers: { origin: ORIGIN },
    });
    expect(allowed.statusCode).toBe(200);
  });
});
