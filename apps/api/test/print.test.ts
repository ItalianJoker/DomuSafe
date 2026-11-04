import type { ProblemDetails, PublicHousePage, PublicRescueSheet, Publication } from '@domusafe/contracts';
import type { LightMyRequestResponse } from 'fastify';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { redactRequestUrl } from '../src/http/redact.js';
import { Client, createTestApp, type TestApp } from './helpers.js';

const PASSWORD = 'una-password-lunga-42';
const UTILITY_ID = '01900000-0000-7000-8000-00000000e501';
const GUIDE_ID = '01900000-0000-7000-8000-00000000e502';
const WIFI_SECRET = 'WIFI-BODY-SEGRETO';
const UTILITY_SECRET = 'UTENZA-CODICE-998877';
const TRADE_NOTE = 'NOTA-ARTIGIANO-SEGRETA';
const BANK_SECRET = 'IBAN-IT60X0542811101000000123456';
const ALLERGY = 'ALLERGIA-PENICILLINA';
const BOILER = 'CALDAIA-NASCOSTA';
const DOCTOR = 'DOTTORE-NON-IN-FOGLIO';
const PET_NOTE = 'NOTA-ANIMALE-SEGRETA';

let ctx: TestApp;
let admin: pg.Pool;
let alice: Client;
let parent: Client;
let child: Client;
let familyId: string;
let houseId: string;

function problem(response: LightMyRequestResponse): ProblemDetails {
  return response.json<ProblemDetails>();
}

function publicationsUrl(): string {
  return `/api/v1/families/${familyId}/houses/${houseId}/publications`;
}

beforeAll(async () => {
  ctx = await createTestApp();
  admin = new pg.Pool({ connectionString: ctx.database.adminUrl, max: 2 });
  alice = new Client(ctx.app);
  parent = new Client(ctx.app);
  child = new Client(ctx.app);
  await alice.signUp('Alice Rossi', 'alice-stampa@example.test', PASSWORD);
  const parentId = await parent.signUp('Paolo Rossi', 'paolo-stampa@example.test', PASSWORD);
  const childId = await child.signUp('Chiara Rossi', 'chiara-stampa@example.test', PASSWORD);
  const created = await alice.create('/api/v1/families', {
    name: 'Famiglia Rossi',
    firstHouse: { name: 'Casa di città' },
  });
  expect(created.statusCode).toBe(201);
  const body = created.json<{ family: { id: string }; house: { id: string } }>();
  familyId = body.family.id;
  houseId = body.house.id;
  await admin.query(`update houses set address_line = $2, postal_code = $3, city = $4 where id = $1`, [
    houseId,
    'Via Roma 1',
    '00100',
    'Roma',
  ]);
  await admin.query(
    `insert into memberships (family_id, account_id, role) values ($1, $2, 'parent'), ($1, $3, 'child')`,
    [familyId, parentId, childId],
  );

  for (const [kind, location] of [
    ['water', 'Contatore acqua nel cortile'],
    ['gas', 'Valvola del gas in cucina'],
    ['electricity', 'Quadro elettrico nell ingresso'],
    ['boiler', BOILER],
  ] as const) {
    const shutoff = await alice.create(`/api/v1/families/${familyId}/houses/${houseId}/shutoffs`, {
      kind,
      location,
      instructions: kind === 'water' ? 'Chiudere in senso orario' : '',
    });
    expect(shutoff.statusCode).toBe(201);
  }

  const artisan = await alice.create(`/api/v1/families/${familyId}/contacts`, {
    kind: 'craftsman',
    houseId,
    trade: 'Idraulico',
    displayName: 'Mario Bianchi',
    phone: '+393331112233',
    notes: TRADE_NOTE,
  });
  expect(artisan.statusCode).toBe(201);
  const doctor = await alice.create(`/api/v1/families/${familyId}/contacts`, {
    kind: 'doctor',
    houseId,
    displayName: DOCTOR,
    phone: '+393330000001',
  });
  expect(doctor.statusCode).toBe(201);

  const guide = await alice.create(`/api/v1/families/${familyId}/houses/${houseId}/guide-entries`, {
    id: GUIDE_ID,
    audience: 'guest',
    topic: 'wifi',
    title: 'Rete di casa',
    body: WIFI_SECRET,
  });
  expect(guide.statusCode).toBe(201);
  const utility = await alice.create(`/api/v1/families/${familyId}/houses/${houseId}/utilities`, {
    id: UTILITY_ID,
    kind: 'electricity',
    providerName: 'Luce di prova',
    customerCode: UTILITY_SECRET,
  });
  expect(utility.statusCode).toBe(201);

  const resident = await alice.create(`/api/v1/families/${familyId}/residents`, {
    displayName: 'Ada Rossi',
    houseIds: [houseId],
  });
  expect(resident.statusCode).toBe(201);
  const residentId = resident.json<{ id: string }>().id;
  const rescue = await alice.request('PUT', `/api/v1/families/${familyId}/residents/${residentId}/rescue`, {
    headers: { 'if-match': '"1"' },
    body: {
      bloodGroup: 'a_positive',
      mobility: 'assisted',
      allergies: [ALLERGY],
      conditions: ['Diabete'],
      devices: [],
      medicines: [{ name: 'Insulina', location: 'Frigorifero' }],
      contacts: [
        { displayName: 'Marta Rossi', phone: '+393339998877', relationship: 'Figlia', hasKeys: true },
      ],
    },
  });
  expect(rescue.statusCode).toBe(200);
  const pet = await alice.create(`/api/v1/families/${familyId}/pets`, {
    name: 'Luna',
    species: 'cat',
    notes: PET_NOTE,
    houseIds: [houseId],
  });
  expect(pet.statusCode).toBe(201);
  await admin.query(
    `insert into personal_bank_accounts (family_id, resident_id, institution, label, reference_hint, notes)
     values ($1, $2, 'Banca di prova', 'Conto', '1234', $3)`,
    [familyId, residentId, BANK_SECRET],
  );
});

afterAll(async () => {
  await admin.end();
  await ctx.close();
});

describe('request logs', () => {
  it('drops the public token from the path', () => {
    expect(redactRequestUrl('/api/v1/public/rescue-sheets/aaaaaaaaaaaaaaaaaaaaaa')).toBe(
      '/api/v1/public/rescue-sheets/redacted',
    );
    expect(redactRequestUrl('/api/v1/families/x/houses/y/publications')).toBe(
      '/api/v1/families/x/houses/y/publications',
    );
  });
});

describe('printed codes', () => {
  it('publishes the house page and the rescue sheet, then revokes the rescue code', async () => {
    expect((await child.request('GET', publicationsUrl())).statusCode).toBe(403);

    const houseCode = await parent.create(publicationsUrl(), { kind: 'house_page' });
    expect(houseCode.statusCode).toBe(201);
    const houseToken = houseCode.json<Publication>().token;
    expect(houseToken).toMatch(/^[A-Za-z0-9_-]{22}$/);
    const again = await parent.create(publicationsUrl(), { kind: 'house_page' });
    expect(again.statusCode).toBe(200);
    expect(again.json<Publication>().token).toBe(houseToken);

    const rescueCode = await alice.create(publicationsUrl(), { kind: 'rescue_sheet' });
    expect(rescueCode.statusCode).toBe(201);
    const rescuePublication = rescueCode.json<Publication>();
    expect(rescuePublication.lastScannedAt).toBeNull();
    const rescueToken = rescuePublication.token ?? '';

    const anon = new Client(ctx.app);
    const housePage = await anon.request('GET', `/api/v1/public/house-pages/${houseToken ?? ''}`, {
      csrf: false,
    });
    expect(housePage.statusCode).toBe(200);
    const houseBody = housePage.body;
    const houseJson = housePage.json<PublicHousePage>();
    expect(houseJson.houseName).toBe('Casa di città');
    expect(houseJson.address).toBe('Via Roma 1, 00100 Roma');
    expect(houseJson.shutoffs.map((item) => item.kind).sort()).toEqual(['electricity', 'gas', 'water']);
    expect(houseJson.tradespeople).toEqual([
      { displayName: 'Mario Bianchi', trade: 'Idraulico', phone: '+393331112233', company: null },
    ]);
    expect(houseJson.primaryContact).toEqual({
      displayName: 'Marta Rossi',
      phone: '+393339998877',
      relationship: 'Figlia',
    });
    for (const secret of [
      WIFI_SECRET,
      UTILITY_SECRET,
      TRADE_NOTE,
      BANK_SECRET,
      ALLERGY,
      BOILER,
      DOCTOR,
      PET_NOTE,
    ]) {
      expect(houseBody, secret).not.toContain(secret);
    }

    const rescuePage = await anon.request('GET', `/api/v1/public/rescue-sheets/${rescueToken}`, {
      csrf: false,
    });
    expect(rescuePage.statusCode).toBe(200);
    const rescueJson = rescuePage.json<PublicRescueSheet>();
    expect(rescueJson.residents[0]?.allergies).toEqual([ALLERGY]);
    expect(rescueJson.residents[0]?.medicines[0]?.name).toBe('Insulina');
    expect(rescueJson.pets[0]?.name).toBe('Luna');
    expect(rescuePage.body).not.toContain(BANK_SECRET);
    expect(rescuePage.body).not.toContain(UTILITY_SECRET);
    expect(rescuePage.body).not.toContain(WIFI_SECRET);
    expect(rescuePage.body).not.toContain(PET_NOTE);
    expect(rescuePage.body).not.toContain('referenceHint');

    const listed = await parent.request('GET', publicationsUrl());
    expect(listed.statusCode).toBe(200);
    const rescueRow = listed
      .json<{ items: Publication[] }>()
      .items.find((item) => item.kind === 'rescue_sheet');
    expect(rescueRow?.lastScannedAt).not.toBeNull();
    expect(rescueRow?.scanCount).toBe(1);

    const wrong = await anon.request('GET', `/api/v1/public/rescue-sheets/${houseToken ?? ''}`, {
      csrf: false,
    });
    expect(wrong.statusCode).toBe(404);

    const revoked = await alice.request('POST', `${publicationsUrl()}/${rescuePublication.id}/revoke`, {
      headers: { 'if-match': '"1"' },
    });
    expect(revoked.statusCode).toBe(200);
    expect(revoked.json<Publication>().token).toBeNull();
    const gone = await anon.request('GET', `/api/v1/public/rescue-sheets/${rescueToken}`, { csrf: false });
    expect(gone.statusCode).toBe(410);
    expect(problem(gone).code).toBe('gone');
    expect(gone.body).not.toContain(ALLERGY);

    const replacement = await alice.create(publicationsUrl(), { kind: 'rescue_sheet' });
    expect(replacement.statusCode).toBe(201);
    expect(replacement.json<Publication>().token).not.toBe(rescueToken);
    const stillGone = await anon.request('GET', `/api/v1/public/rescue-sheets/${rescueToken}`, {
      csrf: false,
    });
    expect(stillGone.statusCode).toBe(410);
  });
});
