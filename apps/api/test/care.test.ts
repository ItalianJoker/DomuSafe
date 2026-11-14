import type {
  Handover,
  ProblemDetails,
  RelationshipEntry,
  Resident,
  ResidentAboutCard,
  VitalEntry,
} from '@domusafe/contracts';
import { calendarDateInTimeZone, formatEtag, shiftCalendarDate } from '@domusafe/contracts';
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
let residentId: string;

function problem(response: LightMyRequestResponse): ProblemDetails {
  return response.json<ProblemDetails>();
}

function residentUrl(suffix = ''): string {
  return `/api/v1/families/${familyId}/residents/${residentId}${suffix}`;
}

function handoversUrl(suffix = ''): string {
  return `/api/v1/families/${familyId}/handovers${suffix}`;
}

beforeAll(async () => {
  ctx = await createTestApp();
  admin = new pg.Pool({ connectionString: ctx.database.adminUrl, max: 2 });
  alice = new Client(ctx.app);
  child = new Client(ctx.app);
  guest = new Client(ctx.app);
  await alice.signUp('Alice Cura', 'alice-care@example.test', PASSWORD);
  const childId = await child.signUp('Chiara Cura', 'chiara-care@example.test', PASSWORD);
  const guestId = await guest.signUp('Dario Cura', 'dario-care@example.test', PASSWORD);
  const created = await alice.create('/api/v1/families', {
    name: 'Famiglia Cura',
    firstHouse: { name: 'Casa di cura' },
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

  const resident = await alice.create(`/api/v1/families/${familyId}/residents`, {
    displayName: 'Nonna Rosa',
    kind: 'elderly',
    houseIds: [houseId],
  });
  expect(resident.statusCode).toBe(201);
  residentId = resident.json<Resident>().id;
});

afterAll(async () => {
  await admin.end();
  await ctx.close();
});

describe('care coordination', () => {
  it('stores Chi sono, the vital diary and handovers on the Free plan', async () => {
    const aboutGet = await alice.request('GET', residentUrl('/about'));
    expect(aboutGet.statusCode).toBe(200);
    expect(aboutGet.json<ResidentAboutCard>().version).toBe(1);

    const aboutPut = await alice.request('PUT', residentUrl('/about'), {
      headers: { 'if-match': formatEtag(1), 'idempotency-key': crypto.randomUUID() },
      body: {
        preferredName: 'Rosa',
        howToAddress: 'Parlare piano e guardarla negli occhi',
        likes: ['Musica leggera', 'Te caldo'],
        dislikes: ['Rumori forti'],
        dailyRoutine: 'Colazione alle otto, passeggiata nel pomeriggio',
        calmingTips: 'Tenere la mano e ripetere il suo nome',
        communicationTips: 'Frasi corte',
        importantNotes: 'Non lasciare la porta del bagno chiusa a chiave',
      },
    });
    expect(aboutPut.statusCode, aboutPut.body).toBe(200);
    expect(aboutPut.json<ResidentAboutCard>().preferredName).toBe('Rosa');

    const vital = await alice.create(residentUrl('/vitals'), {
      measuredAt: new Date().toISOString(),
      systolicMmhg: 128,
      diastolicMmhg: 78,
      heartRateBpm: 72,
      temperatureCelsius: 36.5,
      notes: 'Misura del mattino',
    });
    expect(vital.statusCode).toBe(201);
    const vitalBody = vital.json<VitalEntry>();
    expect(vitalBody.systolicMmhg).toBe(128);
    expect(vital.headers.etag).toBe('"1"');

    const vitalList = await alice.request('GET', residentUrl('/vitals'));
    expect(vitalList.statusCode).toBe(200);
    expect(vitalList.json<{ items: VitalEntry[] }>().items).toHaveLength(1);

    const childWrite = await child.create(residentUrl('/vitals'), {
      measuredAt: new Date().toISOString(),
      heartRateBpm: 80,
    });
    expect(childWrite.statusCode).toBe(403);

    const handover = await alice.create(handoversUrl(), {
      body: 'Ha mangiato poco a pranzo. Controllare la pressione stasera.',
      audience: 'family',
      houseId,
      residentId,
    });
    expect(handover.statusCode).toBe(201);
    const note = handover.json<Handover>();
    expect(note.body).toContain('pressione');

    const guestFamily = await guest.request('GET', handoversUrl(`?houseId=${houseId}`));
    expect(guestFamily.statusCode).toBe(200);
    expect(guestFamily.json<{ items: Handover[] }>().items).toHaveLength(0);

    const guestNote = await alice.create(handoversUrl(), {
      body: 'Le chiavi del cancello sono sul mobile all ingresso.',
      audience: 'guest',
      houseId,
    });
    expect(guestNote.statusCode).toBe(201);
    const guestBody = guestNote.json<Handover>();

    const guestList = await guest.request('GET', handoversUrl(`?houseId=${houseId}`));
    expect(guestList.statusCode).toBe(200);
    expect(guestList.json<{ items: Handover[] }>().items.map((item: Handover) => item.id)).toContain(
      guestBody.id,
    );

    const ack = await guest.request('POST', handoversUrl(`/${guestBody.id}/acknowledge`), {
      headers: { 'if-match': formatEtag(guestBody.version), 'idempotency-key': crypto.randomUUID() },
    });
    expect(ack.statusCode, ack.body).toBe(200);
    expect(ack.json<Handover>().acknowledgedAt).not.toBeNull();

    const forbiddenGuest = await guest.request('GET', residentUrl('/about'));
    expect(forbiddenGuest.statusCode).toBe(403);

    const removed = await alice.request('DELETE', residentUrl(`/vitals/${vitalBody.id}`), {
      headers: { 'if-match': formatEtag(vitalBody.version) },
    });
    expect(removed.statusCode).toBe(204);

    const invalid = await alice.create(residentUrl('/vitals'), {
      measuredAt: new Date().toISOString(),
      systolicMmhg: 120,
    });
    expect(invalid.statusCode).toBe(400);
    expect(problem(invalid).code).toBe('validation_failed');
  });

  it('keeps an ethical personal contact notebook with simple reminders on Free', async () => {
    const today = calendarDateInTimeZone(new Date(), 'Europe/Rome');
    const overdueContact = shiftCalendarDate(today, -20);
    const relationships = `/api/v1/families/${familyId}/relationships`;

    const created = await alice.create(relationships, {
      displayName: 'Marco Amico',
      relation: 'Amico del liceo',
      lastContactOn: overdueContact,
      contactIntervalDays: 14,
      notes: 'Preferisce una telefonata la sera',
    });
    expect(created.statusCode, created.body).toBe(201);
    const entry = created.json<RelationshipEntry>();
    expect(entry.displayName).toBe('Marco Amico');
    expect(entry.ownerAccountId).toBeTruthy();
    expect(entry.reminderState).toBe('overdue');
    expect(entry.nextReminderOn).toBe(shiftCalendarDate(overdueContact, 14));
    expect(entry.notes).toContain('telefonata');

    const listed = await alice.request('GET', relationships);
    expect(listed.statusCode).toBe(200);
    expect(listed.json<{ items: RelationshipEntry[] }>().items.map((item) => item.id)).toContain(entry.id);

    const childOwn = await child.create(relationships, {
      displayName: 'Compagna di classe',
      contactIntervalDays: 30,
      lastContactOn: today,
    });
    expect(childOwn.statusCode, childOwn.body).toBe(201);
    expect(childOwn.json<RelationshipEntry>().reminderState).toBe('upcoming');

    const childSeesAlice = await child.request('GET', relationships);
    expect(childSeesAlice.statusCode).toBe(200);
    expect(childSeesAlice.json<{ items: RelationshipEntry[] }>().items.map((item) => item.id)).not.toContain(
      entry.id,
    );

    const touched = await alice.request('PATCH', `${relationships}/${entry.id}`, {
      headers: { 'if-match': formatEtag(entry.version) },
      body: { lastContactOn: today },
    });
    expect(touched.statusCode, touched.body).toBe(200);
    expect(touched.json<RelationshipEntry>().reminderState).toBe('upcoming');

    const guestDenied = await guest.request('GET', relationships);
    expect(guestDenied.statusCode).toBe(403);

    const removed = await alice.request('DELETE', `${relationships}/${entry.id}`, {
      headers: { 'if-match': formatEtag(touched.json<RelationshipEntry>().version) },
    });
    expect(removed.statusCode).toBe(204);
  });
});
