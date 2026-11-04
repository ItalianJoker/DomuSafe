import type { GuestView, GuideEntry, ProblemDetails, Shutoff, Utility } from '@domusafe/contracts';
import { toBase64Url } from '@domusafe/crypto';
import type { LightMyRequestResponse } from 'fastify';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, createTestApp, type TestApp } from './helpers.js';

const PASSWORD = 'una-password-lunga-42';
const GUIDE_ID = '01900000-0000-7000-8000-00000000e301';
const SECRET_GUIDE_ID = '01900000-0000-7000-8000-00000000e302';
const TECHNICAL_ID = '01900000-0000-7000-8000-00000000e303';
const UTILITY_ID = '01900000-0000-7000-8000-00000000e304';
const SCOPE_ID = '01900000-0000-7000-8000-00000000e401';

let ctx: TestApp;
let admin: pg.Pool;
let alice: Client;
let child: Client;
let guest: Client;
let aliceId: string;
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
  aliceId = await alice.signUp('Alice Rossi', 'alice-casa@example.test', PASSWORD);
  const childId = await child.signUp('Chiara Rossi', 'chiara-casa@example.test', PASSWORD);
  const guestId = await guest.signUp('Dario Ospite', 'dario-casa@example.test', PASSWORD);
  const created = await alice.create('/api/v1/families', {
    name: 'Famiglia Rossi',
    firstHouse: { name: 'Casa di città' },
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

describe('house manual', () => {
  it('stores the guest manual, waste, cutoffs, utilities and the boiler deadline on the Free plan', async () => {
    const guide = await alice.create(houseUrl('/guide-entries'), {
      id: GUIDE_ID,
      audience: 'guest',
      topic: 'wifi',
      title: 'Rete di casa',
      body: 'Il router è nell’ingresso.',
    });
    expect(guide.statusCode).toBe(201);
    expect(guide.headers.etag).toBe('"1"');
    expect(guide.json<GuideEntry>()).toMatchObject({
      id: GUIDE_ID,
      audience: 'guest',
      topic: 'wifi',
      sealed: null,
    });

    const technical = await alice.create(houseUrl('/guide-entries'), {
      id: TECHNICAL_ID,
      audience: 'technical',
      topic: 'heating',
      title: 'Caldaia',
      body: 'Il libretto è nel cassetto.',
    });
    expect(technical.statusCode).toBe(201);

    const waste = await alice.create(houseUrl('/waste-collections'), {
      fraction: 'organic',
      rrule: 'FREQ=WEEKLY;BYDAY=TU',
      collectionTime: '07:00',
      instructions: 'Bidone marrone',
    });
    expect(waste.statusCode).toBe(201);

    const shutoff = await alice.create(houseUrl('/shutoffs'), {
      kind: 'boiler',
      location: 'Nel ripostiglio, in basso a sinistra',
      instructions: 'Girare la manopola in senso orario',
    });
    expect(shutoff.statusCode).toBe(201);
    const shutoffId = shutoff.json<Shutoff>().id;

    const artisan = await alice.create(`/api/v1/families/${familyId}/contacts`, {
      kind: 'craftsman',
      houseId,
      trade: 'Idraulico',
      displayName: 'Mario Bianchi',
      phone: '+393331112233',
    });
    expect(artisan.statusCode).toBe(201);

    const utility = await alice.create(houseUrl('/utilities'), {
      id: UTILITY_ID,
      kind: 'electricity',
      providerName: 'Luce di casa',
      customerCode: 'IT123',
    });
    expect(utility.statusCode).toBe(201);
    expect(utility.json<Utility>().sealed).toBeNull();

    const deadline = await alice.create(houseUrl('/maintenance-tasks'), {
      category: 'heating',
      title: 'Controllo caldaia',
      nextDueDate: '2026-12-01',
    });
    expect(deadline.statusCode).toBe(201);

    const view = (await alice.request('GET', houseUrl('/guest-view'))).json<GuestView>();
    const preview = (await alice.request('GET', houseUrl('/guest-view/preview'))).json<GuestView>();
    expect(preview).toEqual(view);
    expect(view.entries.map((entry) => entry.id)).toEqual([GUIDE_ID]);
    expect(view.wasteCollections).toHaveLength(1);
    expect(view.entries.some((entry) => entry.id === TECHNICAL_ID)).toBe(false);

    const conflict = await alice.request('PATCH', houseUrl(`/shutoffs/${shutoffId}`), {
      body: { location: 'Accanto alla porta' },
      headers: { 'if-match': '"9"' },
    });
    expect(problem(conflict)).toMatchObject({ code: 'version_conflict', currentVersion: 1 });

    const renamed = await alice.request('PATCH', houseUrl(`/shutoffs/${shutoffId}`), {
      body: { location: 'Accanto alla porta' },
      headers: { 'if-match': '"1"' },
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.headers.etag).toBe('"2"');
  });

  it('lets a guest read the manual and hides cutoffs, utilities and the deadline', async () => {
    const view = await guest.request('GET', houseUrl('/guest-view'));
    expect(view.statusCode).toBe(200);
    expect(view.json<GuestView>().entries.map((entry) => entry.topic)).toEqual(['wifi']);
    expect(problem(await guest.request('GET', houseUrl(`/guide-entries/${TECHNICAL_ID}`))).code).toBe(
      'not_found',
    );
    expect(problem(await guest.request('GET', houseUrl('/guide-entries?audience=technical'))).code).toBe(
      'forbidden',
    );
    expect(problem(await guest.request('GET', houseUrl('/shutoffs'))).code).toBe('forbidden');
    expect(problem(await guest.request('GET', houseUrl('/utilities'))).code).toBe('forbidden');
    expect(problem(await guest.request('GET', houseUrl('/maintenance-tasks'))).code).toBe('forbidden');
    const contacts = await guest.request('GET', `/api/v1/families/${familyId}/contacts?kind=craftsman`);
    expect(contacts.statusCode).toBe(200);
    expect(contacts.json<{ items: unknown[] }>().items).toEqual([]);
  });

  it('refuses writes from a child and still lets them read the deadline', async () => {
    expect(
      problem(
        await child.create(houseUrl('/utilities'), {
          id: '01900000-0000-7000-8000-00000000e399',
          kind: 'gas',
          providerName: 'Gas',
        }),
      ).code,
    ).toBe('forbidden');
    expect((await child.request('GET', houseUrl('/maintenance-tasks?category=heating'))).statusCode).toBe(
      200,
    );
    expect(problem(await child.request('GET', houseUrl('/utilities'))).code).toBe('forbidden');
  });

  it('accepts a guest secret only inside a current house envelope', async () => {
    await admin.query(
      `insert into key_scopes (id, family_id, kind, house_id, created_by) values ($1, $2, 'house_guest', $3, $4)`,
      [SCOPE_ID, familyId, houseId, aliceId],
    );
    await admin.query(`insert into scope_key_versions (scope_id, version, created_by) values ($1, 1, $2)`, [
      SCOPE_ID,
      aliceId,
    ]);
    const secret = toBase64Url(Uint8Array.from({ length: 29 }, () => 1));
    const created = await alice.create(houseUrl('/guide-entries'), {
      id: SECRET_GUIDE_ID,
      audience: 'guest',
      topic: 'intercom',
      title: 'Citofono',
      body: 'Il pulsante è il primo',
      sealed: { scopeId: SCOPE_ID, keyVersion: 1, dek: secret, payload: secret },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json<GuideEntry>().sealed).toMatchObject({ scopeId: SCOPE_ID, keyVersion: 1 });

    const stale = await alice.create(houseUrl('/guide-entries'), {
      id: '01900000-0000-7000-8000-00000000e305',
      audience: 'guest',
      topic: 'gate',
      title: 'Cancello',
      sealed: { scopeId: SCOPE_ID, keyVersion: 2, dek: secret, payload: secret },
    });
    expect(problem(stale)).toMatchObject({ code: 'key_version_stale', currentKeyVersion: 1 });

    const wrongAudience = await alice.create(houseUrl('/guide-entries'), {
      id: '01900000-0000-7000-8000-00000000e306',
      audience: 'technical',
      topic: 'other',
      title: 'Quadro',
      sealed: { scopeId: SCOPE_ID, keyVersion: 1, dek: secret, payload: secret },
    });
    expect(problem(wrongAudience).code).toBe('envelope_invalid');
  });
});
