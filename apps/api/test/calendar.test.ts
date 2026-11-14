import {
  calendarDateInTimeZone,
  formatEtag,
  shiftCalendarDate,
  type CalendarBoard,
  type CalendarEvent,
  type CalendarExport,
  type ProblemDetails,
  type Resident,
  type TimetableSlot,
} from '@domusafe/contracts';
import type { LightMyRequestResponse } from 'fastify';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, createTestApp, type TestApp } from './helpers.js';

const PASSWORD = 'una-password-lunga-42';

let ctx: TestApp;
let admin: pg.Pool;
let alice: Client;
let guest: Client;
let familyId: string;
let houseId: string;
let residentId: string;
let today: string;

function problem(response: LightMyRequestResponse): ProblemDetails {
  return response.json<ProblemDetails>();
}

beforeAll(async () => {
  ctx = await createTestApp();
  admin = new pg.Pool({ connectionString: ctx.database.adminUrl, max: 2 });
  alice = new Client(ctx.app);
  guest = new Client(ctx.app);
  await alice.signUp('Alice Calendario', 'alice-calendar@example.test', PASSWORD);
  const guestId = await guest.signUp('Ospite Calendario', 'guest-calendar@example.test', PASSWORD);
  const created = await alice.create('/api/v1/families', {
    name: 'Famiglia Calendario',
    firstHouse: { name: 'Casa calendario' },
  });
  expect(created.statusCode).toBe(201);
  const body = created.json<{ family: { id: string }; house: { id: string } }>();
  familyId = body.family.id;
  houseId = body.house.id;
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
    displayName: 'Marco Calendario',
    houseIds: [houseId],
  });
  expect(resident.statusCode).toBe(201);
  residentId = resident.json<Resident>().id;
  today = calendarDateInTimeZone(new Date(), 'Europe/Rome');
});

afterAll(async () => {
  await admin.end();
  await ctx.close();
});

describe('family calendar', () => {
  it('stores appointments and weekly schedules, builds the board and exports a calendar file', async () => {
    const start = `${today}T09:00:00.000Z`;
    const end = `${today}T10:00:00.000Z`;
    const created = await alice.create(`/api/v1/families/${familyId}/calendar/events`, {
      title: 'Visita pediatra',
      startsAt: start,
      endsAt: end,
      allDay: false,
      category: 'health',
      residentIds: [residentId],
      houseId,
    });
    expect(created.statusCode).toBe(201);
    const event = created.json<CalendarEvent>();
    expect(event.title).toBe('Visita pediatra');
    expect(event.residentIds).toEqual([residentId]);

    const weekday = (() => {
      const [year, month, day] = today.split('-').map(Number);
      const sundayBased = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1)).getUTCDay();
      return sundayBased === 0 ? 7 : sundayBased;
    })();
    const slot = await alice.create(`/api/v1/families/${familyId}/calendar/timetable`, {
      residentId,
      weekday,
      startsAt: '15:00',
      endsAt: '16:30',
      title: 'Allenamento',
      location: 'Palestra',
    });
    expect(slot.statusCode).toBe(201);
    const timetable = slot.json<TimetableSlot>();
    expect(timetable.title).toBe('Allenamento');

    const maintenance = await alice.create(
      `/api/v1/families/${familyId}/houses/${houseId}/maintenance-tasks`,
      {
        category: 'heating',
        title: 'Controllo caldaia',
        nextDueDate: today,
      },
    );
    expect(maintenance.statusCode).toBe(201);

    const chore = await alice.create(`/api/v1/families/${familyId}/chores`, {
      title: 'Sparecchiare',
      points: 2,
      assignedResidentIds: [residentId],
      nextDueDate: today,
      houseId,
    });
    expect(chore.statusCode).toBe(201);

    const to = shiftCalendarDate(today, 7);
    const boardResponse = await alice.request(
      'GET',
      `/api/v1/families/${familyId}/calendar?from=${today}&to=${to}&houseId=${houseId}`,
    );
    expect(boardResponse.statusCode).toBe(200);
    const board = boardResponse.json<CalendarBoard>();
    expect(board.items.some((item) => item.kind === 'event' && item.title === 'Visita pediatra')).toBe(true);
    expect(board.items.some((item) => item.kind === 'timetable' && item.title === 'Allenamento')).toBe(true);
    expect(board.items.some((item) => item.kind === 'deadline' && item.title === 'Controllo caldaia')).toBe(
      true,
    );
    expect(board.items.some((item) => item.kind === 'chore' && item.title === 'Sparecchiare')).toBe(true);

    const exportResponse = await alice.request(
      'GET',
      `/api/v1/families/${familyId}/calendar/export?from=${today}&to=${to}&houseId=${houseId}`,
    );
    expect(exportResponse.statusCode).toBe(200);
    const exported = exportResponse.json<CalendarExport>();
    expect(exported.mediaType).toBe('text/calendar');
    expect(exported.filename.endsWith('.ics')).toBe(true);
    expect(exported.body).toContain('BEGIN:VCALENDAR');
    expect(exported.body).toContain('Visita pediatra');
    expect(exported.body).toContain('Controllo caldaia');

    const updated = await alice.request('PATCH', `/api/v1/families/${familyId}/calendar/events/${event.id}`, {
      body: { title: 'Visita di controllo' },
      headers: { 'if-match': formatEtag(event.version) },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json<CalendarEvent>().title).toBe('Visita di controllo');

    const guestBoard = await guest.request(
      'GET',
      `/api/v1/families/${familyId}/calendar?from=${today}&to=${to}&houseId=${houseId}`,
    );
    expect(guestBoard.statusCode).toBe(403);
    expect(problem(guestBoard).code).toBe('forbidden');
  });
});
