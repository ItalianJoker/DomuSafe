import {
  calendarDateInTimeZone,
  deadlineGroup,
  formatEtag,
  shiftCalendarDate,
  type DeadlineBoard,
  type MaintenanceTask,
  type ProblemDetails,
  type Resident,
} from '@domusafe/contracts';
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
let residentId: string;
let today: string;

function problem(response: LightMyRequestResponse): ProblemDetails {
  return response.json<ProblemDetails>();
}

function deadlinesUrl(): string {
  return `/api/v1/families/${familyId}/deadlines?houseId=${houseId}`;
}

function firstOf(board: DeadlineBoard, kind: DeadlineBoard['overdue'][number]['kind'], sourceId?: string) {
  return [...board.overdue, ...board.week, ...board.month].find(
    (item) => item.kind === kind && (sourceId === undefined || item.sourceId === sourceId),
  );
}

beforeAll(async () => {
  ctx = await createTestApp();
  admin = new pg.Pool({ connectionString: ctx.database.adminUrl, max: 2 });
  alice = new Client(ctx.app);
  child = new Client(ctx.app);
  guest = new Client(ctx.app);
  aliceId = await alice.signUp('Alice Rossi', 'alice-deadlines@example.test', PASSWORD);
  const childId = await child.signUp('Chiara Rossi', 'chiara-deadlines@example.test', PASSWORD);
  const guestId = await guest.signUp('Dario Ospite', 'dario-deadlines@example.test', PASSWORD);
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
  const resident = await alice.create(`/api/v1/families/${familyId}/residents`, {
    displayName: 'Marco Rossi',
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

describe('overview deadlines', () => {
  it('groups stored dates and keeps a hand-added task in Postgres', async () => {
    const overdue = shiftCalendarDate(today, -10);
    const weekDate = today;
    let monthDate = shiftCalendarDate(today, 1);
    while (deadlineGroup(monthDate, today) !== 'month') {
      monthDate = shiftCalendarDate(monthDate, 1);
      if (monthDate > shiftCalendarDate(today, 40)) {
        monthDate = '';
        break;
      }
    }
    const later = shiftCalendarDate(today, 400);

    const boiler = await alice.create(`/api/v1/families/${familyId}/houses/${houseId}/maintenance-tasks`, {
      category: 'heating',
      title: 'Controllo caldaia',
      nextDueDate: weekDate,
    });
    expect(boiler.statusCode).toBe(201);

    const added = await alice.create(`/api/v1/families/${familyId}/houses/${houseId}/maintenance-tasks`, {
      category: 'other',
      title: 'Pulizia grondaie',
      nextDueDate: monthDate === '' ? weekDate : monthDate,
    });
    expect(added.statusCode).toBe(201);
    const task = added.json<MaintenanceTask>();

    const finished = await alice.create(`/api/v1/families/${familyId}/houses/${houseId}/maintenance-tasks`, {
      category: 'other',
      title: 'Lampadina del pianerottolo',
      nextDueDate: overdue,
      lastDoneOn: overdue,
    });
    expect(finished.statusCode).toBe(201);
    const finishedTask = finished.json<MaintenanceTask>();

    const vehicle = await alice.create(`/api/v1/families/${familyId}/residents/${residentId}/vehicles`, {
      plate: 'AB 123 CD',
      insuranceRenewalDate: overdue,
      roadTaxDueDate: weekDate,
      inspectionDueDate: later,
    });
    expect(vehicle.statusCode).toBe(201);
    const vehicleId = vehicle.json<{ id: string }>().id;

    await admin.query(
      `insert into tax_checklist_items (family_id, resident_id, tax_year, item_key, due_date, status, created_by)
       values ($1, $2, 2026, 'waste_tax', $3, 'todo', $4),
              ($1, $2, 2026, 'isee', $3, 'done', $4)`,
      [familyId, residentId, weekDate, aliceId],
    );
    await admin.query(
      `insert into succession_items (family_id, kind, title, deadline_note, done, created_by)
       values ($1, 'custom', 'Voltura con data', $2, false, $3),
              ($1, 'custom', 'Promemoria senza data', 'Entro dodici mesi', false, $3)`,
      [familyId, weekDate, aliceId],
    );

    const free = await alice.request('GET', deadlinesUrl());
    expect(free.statusCode).toBe(200);
    const freeBoard = free.json<DeadlineBoard>();
    expect(freeBoard.timezone).toBe('Europe/Rome');
    expect(freeBoard.today).toBe(today);
    expect(firstOf(freeBoard, 'maintenance', boiler.json<MaintenanceTask>().id)?.dueDate).toBe(weekDate);
    expect(firstOf(freeBoard, 'maintenance', task.id)?.title).toBe('Pulizia grondaie');
    expect(firstOf(freeBoard, 'maintenance', finishedTask.id)).toBeUndefined();
    expect(firstOf(freeBoard, 'vehicle_insurance', vehicleId)).toMatchObject({
      dueDate: overdue,
      detail: 'AB 123 CD',
    });
    expect(deadlineGroup(overdue, today)).toBe('overdue');
    expect(
      freeBoard.overdue.some((item) => item.sourceId === vehicleId && item.kind === 'vehicle_insurance'),
    ).toBe(true);
    expect(firstOf(freeBoard, 'vehicle_road_tax', vehicleId)?.dueDate).toBe(weekDate);
    expect(firstOf(freeBoard, 'vehicle_inspection', vehicleId)).toBeUndefined();
    expect(
      freeBoard.overdue.concat(freeBoard.week, freeBoard.month).some((item) => item.kind === 'tax'),
    ).toBe(false);
    expect(
      freeBoard.overdue.concat(freeBoard.week, freeBoard.month).some((item) => item.kind === 'succession'),
    ).toBe(false);

    const stored = await alice.request(
      'GET',
      `/api/v1/families/${familyId}/houses/${houseId}/maintenance-tasks`,
    );
    expect(stored.statusCode).toBe(200);
    expect(stored.json<{ items: { title: string }[] }>().items.map((item) => item.title)).toContain(
      'Lampadina del pianerottolo',
    );

    await admin.query(
      `insert into premium_trials (account_id, family_id, started_at, ends_at)
       select $1, $2, t, t + interval '30 days' from (select now() as t) s`,
      [aliceId, familyId],
    );

    const premium = (await alice.request('GET', deadlinesUrl())).json<DeadlineBoard>();
    const tax = firstOf(premium, 'tax');
    expect(tax).toMatchObject({ taxItemKey: 'waste_tax', dueDate: weekDate, detail: '2026' });
    expect(
      premium.overdue.concat(premium.week, premium.month).filter((item) => item.kind === 'tax'),
    ).toHaveLength(1);
    const succession = firstOf(premium, 'succession');
    expect(succession).toMatchObject({ title: 'Voltura con data', dueDate: weekDate });
    expect(
      premium.overdue.concat(premium.week, premium.month).filter((item) => item.kind === 'succession'),
    ).toHaveLength(1);

    const childView = await child.request('GET', deadlinesUrl());
    expect(childView.statusCode).toBe(200);
    expect(firstOf(childView.json<DeadlineBoard>(), 'maintenance', task.id)?.title).toBe('Pulizia grondaie');

    expect(problem(await guest.request('GET', deadlinesUrl())).code).toBe('forbidden');
    expect(
      problem(
        await alice.request(
          'GET',
          `/api/v1/families/${familyId}/deadlines?houseId=01900000-0000-7000-8000-000000000099`,
        ),
      ).code,
    ).toBe('not_found');

    const marked = await alice.request(
      'PATCH',
      `/api/v1/families/${familyId}/houses/${houseId}/maintenance-tasks/${task.id}`,
      {
        headers: { 'if-match': formatEtag(task.version) },
        body: { lastDoneOn: task.nextDueDate },
      },
    );
    expect(marked.statusCode).toBe(200);
    const after = (await alice.request('GET', deadlinesUrl())).json<DeadlineBoard>();
    expect(firstOf(after, 'maintenance', task.id)).toBeUndefined();
    const stillThere = await alice.request(
      'GET',
      `/api/v1/families/${familyId}/houses/${houseId}/maintenance-tasks/${task.id}`,
    );
    expect(stillThere.statusCode).toBe(200);
    expect(stillThere.json<MaintenanceTask>().title).toBe('Pulizia grondaie');
  });
});
