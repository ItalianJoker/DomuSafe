import type {
  Chore,
  ChoreCompletion,
  PointEntry,
  PointsView,
  ProblemDetails,
  Resident,
  Reward,
  RewardRedemption,
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
let familyId: string;
let houseId: string;
let residentId: string;

function problem(response: LightMyRequestResponse): ProblemDetails {
  return response.json<ProblemDetails>();
}

function choresUrl(suffix = ''): string {
  return `/api/v1/families/${familyId}/chores${suffix}`;
}

function completionsUrl(suffix = ''): string {
  return `/api/v1/families/${familyId}/chore-completions${suffix}`;
}

function pointsUrl(query: string): string {
  return `/api/v1/families/${familyId}/points?${query}`;
}

function rewardsUrl(suffix = ''): string {
  return `/api/v1/families/${familyId}/rewards${suffix}`;
}

function redemptionsUrl(suffix = ''): string {
  return `/api/v1/families/${familyId}/redemptions${suffix}`;
}

beforeAll(async () => {
  ctx = await createTestApp();
  admin = new pg.Pool({ connectionString: ctx.database.adminUrl, max: 2 });
  alice = new Client(ctx.app);
  child = new Client(ctx.app);
  await alice.signUp('Alice Punti', 'alice-rewards@example.test', PASSWORD);
  const childId = await child.signUp('Luca Punti', 'luca-rewards@example.test', PASSWORD);
  const created = await alice.create('/api/v1/families', {
    name: 'Famiglia Punti',
    firstHouse: { name: 'Casa punti' },
  });
  expect(created.statusCode).toBe(201);
  const body = created.json<{ family: { id: string; plan: { tier: string } }; house: { id: string } }>();
  familyId = body.family.id;
  houseId = body.house.id;
  expect(body.family.plan.tier).toBe('free');

  const membership = await admin.query<{ id: string }>(
    `insert into memberships (family_id, account_id, role, all_houses, all_residents)
     values ($1, $2, 'child', true, false) returning id`,
    [familyId, childId],
  );

  const resident = await alice.create(`/api/v1/families/${familyId}/residents`, {
    displayName: 'Luca',
    kind: 'child',
    houseIds: [houseId],
  });
  expect(resident.statusCode).toBe(201);
  residentId = resident.json<Resident>().id;

  await admin.query(`update residents set account_id = $1 where id = $2`, [childId, residentId]);
  await admin.query(
    `insert into membership_residents (membership_id, family_id, resident_id) values ($1, $2, $3)`,
    [membership.rows[0]!.id, familyId, residentId],
  );
});

afterAll(async () => {
  await admin.end();
  await ctx.close();
});

describe('family chores and rewards', () => {
  it('schedules chores, awards points with streaks and runs the rewards store on Free', async () => {
    const chore = await alice.create(choresUrl(), {
      title: 'Sparecchiare la tavola',
      description: 'Portare i piatti in cucina dopo cena',
      houseId,
      points: 5,
      rrule: 'FREQ=DAILY',
      assignment: 'fixed',
      assignedResidentIds: [residentId],
      nextDueDate: '2026-11-14',
      requiresApproval: true,
    });
    expect(chore.statusCode, chore.body).toBe(201);
    const choreBody = chore.json<Chore>();
    expect(choreBody.points).toBe(5);
    expect(chore.headers.etag).toBe('"1"');

    const childComplete = await child.create(choresUrl(`/${choreBody.id}/completions`), {
      residentId,
      dueDate: '2026-11-14',
      note: 'Fatto dopo cena',
    });
    expect(childComplete.statusCode, childComplete.body).toBe(201);
    const pending = childComplete.json<ChoreCompletion>();
    expect(pending.status).toBe('pending_approval');
    expect(pending.pointsAwarded).toBe(0);

    const pendingList = await alice.request('GET', completionsUrl('?status=pending_approval&limit=20'));
    expect(pendingList.statusCode).toBe(200);
    expect(pendingList.json<{ items: ChoreCompletion[] }>().items.map((item) => item.id)).toContain(
      pending.id,
    );

    const approved = await alice.request('POST', completionsUrl(`/${pending.id}/approve`), {
      headers: { 'idempotency-key': crypto.randomUUID() },
    });
    expect(approved.statusCode, approved.body).toBe(200);
    expect(approved.json<ChoreCompletion>().status).toBe('approved');
    expect(approved.json<ChoreCompletion>().pointsAwarded).toBe(5);

    const points = await alice.request('GET', pointsUrl(`residentId=${residentId}&limit=20`));
    expect(points.statusCode).toBe(200);
    const pointsBody = points.json<PointsView>();
    expect(pointsBody.balance).toBe(5);
    expect(pointsBody.streak.currentDays).toBe(1);
    expect(pointsBody.streak.bestDays).toBe(1);
    expect(pointsBody.items.some((item: PointEntry) => item.source === 'chore' && item.delta === 5)).toBe(
      true,
    );

    const updatedChore = await alice.request('GET', choresUrl(`/${choreBody.id}`));
    expect(updatedChore.statusCode).toBe(200);
    expect(updatedChore.json<Chore>().nextDueDate).toBe('2026-11-15');

    const reward = await alice.create(rewardsUrl(), {
      title: 'Mezzora di videogiochi',
      costPoints: 5,
      stock: 2,
    });
    expect(reward.statusCode, reward.body).toBe(201);
    const rewardBody = reward.json<Reward>();
    expect(rewardBody.costPoints).toBe(5);

    const request = await child.create(rewardsUrl(`/${rewardBody.id}/redemptions`), {
      residentId,
    });
    expect(request.statusCode, request.body).toBe(201);
    const redemption = request.json<RewardRedemption>();
    expect(redemption.status).toBe('requested');

    const approveRedemption = await alice.request('POST', redemptionsUrl(`/${redemption.id}/approve`), {
      headers: {
        'if-match': formatEtag(redemption.version),
        'idempotency-key': crypto.randomUUID(),
      },
    });
    expect(approveRedemption.statusCode, approveRedemption.body).toBe(200);
    expect(approveRedemption.json<RewardRedemption>().status).toBe('approved');

    const afterSpend = await alice.request('GET', pointsUrl(`residentId=${residentId}&limit=20`));
    expect(afterSpend.json<PointsView>().balance).toBe(0);

    const stocked = await alice.request('GET', rewardsUrl());
    expect(stocked.statusCode).toBe(200);
    expect(stocked.json<{ items: Reward[] }>().items.find((item) => item.id === rewardBody.id)?.stock).toBe(
      1,
    );

    const auto = await alice.create(choresUrl(), {
      title: 'Annaffiare le piante',
      points: 2,
      requiresApproval: false,
      assignedResidentIds: [residentId],
      nextDueDate: '2026-11-14',
    });
    expect(auto.statusCode).toBe(201);
    const autoBody = auto.json<Chore>();
    const instant = await child.create(choresUrl(`/${autoBody.id}/completions`), {
      residentId,
      dueDate: '2026-11-14',
    });
    expect(instant.statusCode, instant.body).toBe(201);
    expect(instant.json<ChoreCompletion>().status).toBe('approved');
    expect(instant.json<ChoreCompletion>().pointsAwarded).toBe(2);

    const forbiddenManage = await child.create(choresUrl(), {
      title: 'Non permesso',
      points: 1,
    });
    expect(forbiddenManage.statusCode).toBe(403);
    expect(problem(forbiddenManage).code).toBe('forbidden');
  });
});
