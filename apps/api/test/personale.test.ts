import type {
  Pet,
  ProblemDetails,
  RescueCard,
  RescueSheet,
  Resident,
  TaxChecklist,
} from '@domusafe/contracts';
import { formatEtag } from '@domusafe/contracts';
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
let aliceId: string;
let familyId: string;
let houseId: string;

function problem(response: LightMyRequestResponse): ProblemDetails {
  return response.json<ProblemDetails>();
}

function residentsUrl(suffix = ''): string {
  return `/api/v1/families/${familyId}/residents${suffix}`;
}

beforeAll(async () => {
  ctx = await createTestApp();
  admin = new pg.Pool({ connectionString: ctx.database.adminUrl, max: 2 });
  alice = new Client(ctx.app);
  child = new Client(ctx.app);
  guest = new Client(ctx.app);
  aliceId = await alice.signUp('Alice Rossi', 'alice-personale@example.test', PASSWORD);
  const childId = await child.signUp('Chiara Rossi', 'chiara-personale@example.test', PASSWORD);
  const guestId = await guest.signUp('Dario Ospite', 'dario-personale@example.test', PASSWORD);
  const created = await alice.create('/api/v1/families', {
    name: 'Famiglia Rossi',
    firstHouse: { name: 'Casa di città' },
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
});

afterAll(async () => {
  await admin.end();
  await ctx.close();
});

describe('personale', () => {
  it('stores the rescue card, services and pets, and keeps taxes and bank accounts on Premium', async () => {
    const created = await alice.create(residentsUrl(), {
      displayName: 'Marco Rossi',
      birthYear: 1984,
      usualBedroom: 'Camera sul cortile',
      houseIds: [houseId],
    });
    expect(created.statusCode).toBe(201);
    const resident = created.json<Resident>();
    expect(resident.houseIds).toEqual([houseId]);
    expect(resident.birthYear).toBe(1984);

    const limited = await alice.create(residentsUrl(), {
      displayName: 'Seconda persona',
      houseIds: [houseId],
    });
    expect(limited.statusCode).toBe(403);
    expect(problem(limited).code).toBe('plan_limit_reached');

    const forbidden = await child.create(residentsUrl(), { displayName: 'Dal figlio' });
    expect(forbidden.statusCode).toBe(403);

    const rescue = await alice.request('PUT', residentsUrl(`/${resident.id}/rescue`), {
      headers: { 'if-match': formatEtag(1) },
      body: {
        bloodGroup: 'a_positive',
        mobility: 'assisted',
        allergies: ['Penicillina'],
        conditions: ['Asma'],
        devices: ['Inalatore'],
        medicines: [{ name: 'Adrenalina', location: 'Cassetto del comodino' }],
        contacts: [
          { displayName: 'Giulia Rossi', phone: '+393331112233', relationship: 'Moglie', hasKeys: true },
          { displayName: 'Paolo Verdi', phone: null, relationship: 'Vicino', hasKeys: false },
        ],
      },
    });
    expect(rescue.statusCode).toBe(200);
    const card = rescue.json<RescueCard>();
    expect(card.medicines[0]?.location).toBe('Cassetto del comodino');
    expect(card.contacts[0]?.hasKeys).toBe(true);
    expect(card.contacts[1]?.sortOrder).toBe(1);

    const conflict = await alice.request('PUT', residentsUrl(`/${resident.id}/rescue`), {
      headers: { 'if-match': formatEtag(1) },
      body: {
        bloodGroup: null,
        mobility: null,
        allergies: [],
        conditions: [],
        devices: [],
        medicines: [],
        contacts: [],
      },
    });
    expect(conflict.statusCode).toBe(409);
    expect(problem(conflict).code).toBe('version_conflict');

    const sheet = await alice.request('GET', `/api/v1/families/${familyId}/houses/${houseId}/rescue-sheet`);
    expect(sheet.statusCode).toBe(200);
    const readable = sheet.json<RescueSheet>();
    expect(readable.residents[0]).toMatchObject({
      displayName: 'Marco Rossi',
      birthYear: 1984,
      usualBedroom: 'Camera sul cortile',
      bloodGroup: 'a_positive',
    });
    expect(readable.residents[0]?.medicines[0]?.name).toBe('Adrenalina');

    const guestSheet = await guest.request(
      'GET',
      `/api/v1/families/${familyId}/houses/${houseId}/rescue-sheet`,
    );
    expect(guestSheet.statusCode).toBe(403);

    const phone = await alice.create(residentsUrl(`/${resident.id}/phone-lines`), {
      operatorName: 'Operatore di città',
      phoneNumber: '+393339998877',
      planName: 'Voce e dati',
      renewalDate: '2026-11-01',
    });
    expect(phone.statusCode).toBe(201);

    const subscription = await alice.create(residentsUrl(`/${resident.id}/subscriptions`), {
      name: 'Palestra',
      providerName: 'Centro sportivo',
      renewalDate: '2026-12-01',
    });
    expect(subscription.statusCode).toBe(201);

    const vehicle = await alice.create(residentsUrl(`/${resident.id}/vehicles`), {
      plate: 'ab 123 cd',
      insuranceRenewalDate: '2026-06-15',
      roadTaxDueDate: '2026-07-31',
      inspectionDueDate: '2027-03-01',
    });
    expect(vehicle.statusCode).toBe(201);
    expect(vehicle.json<{ plate: string }>().plate).toBe('AB 123 CD');

    const pet = await alice.create(`/api/v1/families/${familyId}/pets`, {
      name: 'Luna',
      species: 'cat',
      vetName: 'Clinica del quartiere',
      vetPhone: '+390212345678',
      houseIds: [houseId],
    });
    expect(pet.statusCode).toBe(201);
    const secondPet = await alice.create(`/api/v1/families/${familyId}/pets`, {
      name: 'Altro',
      species: 'dog',
      houseIds: [houseId],
    });
    expect(secondPet.statusCode).toBe(403);
    expect(problem(secondPet).code).toBe('plan_limit_reached');

    const sheetWithPet = await alice.request(
      'GET',
      `/api/v1/families/${familyId}/houses/${houseId}/rescue-sheet`,
    );
    expect(sheetWithPet.json<RescueSheet>().pets[0]).toMatchObject({ name: 'Luna', species: 'cat' });

    const taxBlocked = await alice.create(`/api/v1/families/${familyId}/tax-checklist/generate`, {
      residentId: resident.id,
      year: 2026,
    });
    expect(taxBlocked.statusCode).toBe(403);
    expect(problem(taxBlocked).code).toBe('plan_required');
    expect(problem(taxBlocked).requiredPlan).toBe('premium');

    const bankBlocked = await alice.create(residentsUrl(`/${resident.id}/bank-accounts`), {
      institution: 'Banca del borgo',
      label: 'Conto corrente',
      referenceHint: '4321',
    });
    expect(bankBlocked.statusCode).toBe(403);
    expect(problem(bankBlocked).code).toBe('plan_required');

    await admin.query(
      `insert into premium_trials (account_id, family_id, started_at, ends_at)
       select $1, $2, t, t + interval '30 days' from (select now() as t) s`,
      [aliceId, familyId],
    );

    const tax = await alice.create(`/api/v1/families/${familyId}/tax-checklist/generate`, {
      residentId: resident.id,
      year: 2026,
    });
    expect(tax.statusCode).toBe(200);
    const checklist = tax.json<TaxChecklist>();
    expect(checklist.items.map((item) => item.itemKey)).toEqual([
      'declaration',
      'precompiled_return',
      'isee',
      'property_tax',
      'waste_tax',
      'income_tax_first_instalment',
      'income_tax_second_instalment',
    ]);
    const declaration = checklist.items.find((item) => item.itemKey === 'declaration');
    expect(declaration).toBeDefined();
    const marked = await alice.request(
      'PATCH',
      `/api/v1/families/${familyId}/tax-checklist/${declaration!.id}`,
      {
        headers: { 'if-match': formatEtag(declaration!.version) },
        body: { status: 'done' },
      },
    );
    expect(marked.statusCode).toBe(200);

    const bank = await alice.create(residentsUrl(`/${resident.id}/bank-accounts`), {
      institution: 'Banca del borgo',
      label: 'Conto corrente',
      referenceHint: '4321',
    });
    expect(bank.statusCode).toBe(201);
    expect(bank.json<{ referenceHint: string }>().referenceHint).toBe('4321');

    const fullNumber = await alice.create(residentsUrl(`/${resident.id}/bank-accounts`), {
      institution: 'Banca del borgo',
      label: 'Libretto',
      referenceHint: 'IT60X0542811101000000123456',
    });
    expect(fullNumber.statusCode).toBe(400);

    expect(pet.json<Pet>().vetPhone).toBe('+390212345678');
  });
});
