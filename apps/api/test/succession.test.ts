import type { ProblemDetails, SuccessionItem, SuccessionList } from '@domusafe/contracts';
import { formatEtag } from '@domusafe/contracts';
import type { LightMyRequestResponse } from 'fastify';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, createTestApp, type TestApp } from './helpers.js';

const PASSWORD = 'una-password-lunga-42';
const ITEM_KEYS = [
  'completedAt',
  'deadlineNote',
  'done',
  'familyId',
  'id',
  'kind',
  'notes',
  'sortOrder',
  'title',
  'updatedAt',
  'version',
];

let ctx: TestApp;
let admin: pg.Pool;
let alice: Client;
let parent: Client;
let child: Client;
let aliceId: string;
let familyId: string;

function problem(response: LightMyRequestResponse): ProblemDetails {
  return response.json<ProblemDetails>();
}

function url(suffix = ''): string {
  return `/api/v1/families/${familyId}/succession${suffix}`;
}

beforeAll(async () => {
  ctx = await createTestApp();
  admin = new pg.Pool({ connectionString: ctx.database.adminUrl, max: 2 });
  alice = new Client(ctx.app);
  parent = new Client(ctx.app);
  child = new Client(ctx.app);
  aliceId = await alice.signUp('Alice Rossi', 'alice-succession@example.test', PASSWORD);
  const parentId = await parent.signUp('Paolo Rossi', 'paolo-succession@example.test', PASSWORD);
  const childId = await child.signUp('Chiara Rossi', 'chiara-succession@example.test', PASSWORD);
  const created = await alice.create('/api/v1/families', {
    name: 'Famiglia Rossi',
    firstHouse: { name: 'Casa di città' },
  });
  expect(created.statusCode).toBe(201);
  familyId = created.json<{ family: { id: string } }>().family.id;
  await admin.query(`insert into memberships (family_id, account_id, role) values ($1, $2, 'parent')`, [
    familyId,
    parentId,
  ]);
  await admin.query(`insert into memberships (family_id, account_id, role) values ($1, $2, 'child')`, [
    familyId,
    childId,
  ]);
});

afterAll(async () => {
  await admin.end();
  await ctx.close();
});

describe('succession checklist', () => {
  it('stays closed below Premium, then stores activities without vault fields', async () => {
    const blocked = await alice.request('GET', url());
    expect(blocked.statusCode).toBe(403);
    expect(problem(blocked).code).toBe('plan_required');
    expect(problem(blocked).requiredPlan).toBe('premium');

    await admin.query(`update families set plan = 'advanced' where id = $1`, [familyId]);
    const advanced = await alice.request('POST', url('/prepare'), {
      headers: { 'idempotency-key': crypto.randomUUID() },
    });
    expect(advanced.statusCode).toBe(403);
    expect(problem(advanced).code).toBe('plan_required');
    expect(problem(advanced).requiredPlan).toBe('premium');

    await admin.query(
      `insert into premium_trials (account_id, family_id, started_at, ends_at)
       select $1, $2, t, t + interval '30 days' from (select now() as t) s`,
      [aliceId, familyId],
    );

    const denied = await child.request('GET', url());
    expect(denied.statusCode).toBe(403);
    expect(problem(denied).code).toBe('forbidden');
    const parentDenied = await parent.request('POST', url('/prepare'), {
      headers: { 'idempotency-key': crypto.randomUUID() },
    });
    expect(parentDenied.statusCode).toBe(403);
    expect(problem(parentDenied).code).toBe('forbidden');

    const prepared = await alice.request('POST', url('/prepare'), {
      headers: { 'idempotency-key': crypto.randomUUID() },
    });
    expect(prepared.statusCode).toBe(200);
    const checklist = prepared.json<SuccessionList>();
    expect(checklist.items.map((item) => item.kind)).toEqual([
      'documents',
      'will',
      'notary',
      'titles',
      'declaration',
      'utility_transfers',
    ]);
    expect(checklist.items.every((item) => item.title === null && !item.done)).toBe(true);
    const declaration = checklist.items.find((item) => item.kind === 'declaration');
    expect(declaration).toBeDefined();
    expect(Object.keys(declaration!).sort()).toEqual(ITEM_KEYS);

    const again = await alice.request('POST', url('/prepare'), {
      headers: { 'idempotency-key': crypto.randomUUID() },
    });
    expect(again.statusCode).toBe(200);
    expect(again.json<SuccessionList>().items).toHaveLength(6);

    const marked = await alice.request('PATCH', url(`/${declaration!.id}`), {
      headers: { 'if-match': formatEtag(declaration!.version) },
      body: { done: true, deadlineNote: 'Entro dodici mesi dal decesso' },
    });
    expect(marked.statusCode).toBe(200);
    const done = marked.json<SuccessionItem>();
    expect(done.done).toBe(true);
    expect(done.completedAt).not.toBeNull();
    expect(done.deadlineNote).toBe('Entro dodici mesi dal decesso');

    const stale = await alice.request('PATCH', url(`/${declaration!.id}`), {
      headers: { 'if-match': formatEtag(declaration!.version) },
      body: { done: false },
    });
    expect(stale.statusCode).toBe(409);
    expect(problem(stale).code).toBe('version_conflict');

    const added = await alice.create(url(), { title: 'Avvisare la banca di famiglia' });
    expect(added.statusCode).toBe(201);
    const custom = added.json<SuccessionItem>();
    expect(custom.kind).toBe('custom');
    expect(custom.title).toBe('Avvisare la banca di famiglia');

    const secret = await alice.create(url(), { title: 'Conto 123456789012' });
    expect(secret.statusCode).toBe(400);
    expect(problem(secret).code).toBe('validation_failed');

    const removed = await alice.request('DELETE', url(`/${custom.id}`), {
      headers: { 'if-match': formatEtag(custom.version) },
    });
    expect(removed.statusCode).toBe(204);
    const listed = await alice.request('GET', url());
    expect(listed.statusCode).toBe(200);
    const items = listed.json<SuccessionList>().items;
    expect(items.some((item) => item.id === custom.id)).toBe(false);
    expect(items.find((item) => item.kind === 'declaration')?.done).toBe(true);
    expect(JSON.stringify(listed.json())).not.toContain('encPayload');
    expect(JSON.stringify(listed.json())).not.toContain('sealed');
  });
});
