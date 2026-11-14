import type { GuideEntry, ProblemDetails, Revision } from '@domusafe/contracts';
import { formatEtag, REALTIME_SUBPROTOCOL } from '@domusafe/contracts';
import type { LightMyRequestResponse } from 'fastify';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { Client, createTestApp, ORIGIN, type TestApp } from './helpers.js';

const PASSWORD = 'una-password-lunga-42';
const ENTRY_ID = '01900000-0000-7000-8000-00000000c101';

let ctx: TestApp;
let admin: pg.Pool;
let alice: Client;
let parent: Client;
let familyId: string;
let houseId: string;

function problem(response: LightMyRequestResponse): ProblemDetails {
  return response.json<ProblemDetails>();
}

beforeAll(async () => {
  ctx = await createTestApp();
  admin = new pg.Pool({ connectionString: ctx.database.adminUrl, max: 2 });
  alice = new Client(ctx.app);
  parent = new Client(ctx.app);
  await alice.signUp('Alice Sync', 'alice-sync@example.test', PASSWORD);
  const parentId = await parent.signUp('Paolo Sync', 'paolo-sync@example.test', PASSWORD);
  const created = await alice.create('/api/v1/families', {
    name: 'Famiglia Sync',
    firstHouse: { name: 'Casa sync' },
  });
  expect(created.statusCode).toBe(201);
  const body = created.json<{ family: { id: string }; house: { id: string } }>();
  familyId = body.family.id;
  houseId = body.house.id;
  await admin.query(`insert into memberships (family_id, account_id, role) values ($1, $2, 'parent')`, [
    familyId,
    parentId,
  ]);
});

afterAll(async () => {
  await admin.end();
  await ctx.close();
});

describe('realtime sync, revisions and audit', () => {
  it('records revisions, lists audit on Premium, restores a guide entry and fans out on the socket', async () => {
    const create = await alice.create(`/api/v1/families/${familyId}/houses/${houseId}/guide-entries`, {
      id: ENTRY_ID,
      audience: 'guest',
      topic: 'wifi',
      title: 'Rete di casa',
      body: 'Prima versione',
    });
    expect(create.statusCode).toBe(201);
    const created = create.json<GuideEntry>();

    const update = await alice.request(
      'PATCH',
      `/api/v1/families/${familyId}/houses/${houseId}/guide-entries/${ENTRY_ID}`,
      {
        headers: { 'if-match': formatEtag(created.version) },
        body: { title: 'Rete aggiornata', body: 'Seconda versione' },
      },
    );
    expect(update.statusCode).toBe(200);
    const updated = update.json<GuideEntry>();
    expect(updated.title).toBe('Rete aggiornata');

    const revisionsFree = await alice.request(
      'GET',
      `/api/v1/families/${familyId}/revisions?resourceType=house_guide_entries&resourceId=${ENTRY_ID}`,
    );
    expect(revisionsFree.statusCode).toBe(200);
    expect(revisionsFree.json<{ items: Revision[] }>().items.length).toBeGreaterThanOrEqual(2);

    const auditBlocked = await alice.request('GET', `/api/v1/families/${familyId}/audit-events`);
    expect(auditBlocked.statusCode).toBe(403);
    expect(problem(auditBlocked).code).toBe('two_factor_setup_required');

    await alice.enableTwoFactor(PASSWORD);
    const auditPlan = await alice.request('GET', `/api/v1/families/${familyId}/audit-events`);
    expect(auditPlan.statusCode).toBe(403);
    expect(problem(auditPlan).code).toBe('plan_required');
    expect(problem(auditPlan).requiredPlan).toBe('premium');

    await admin.query(
      `insert into premium_trials (account_id, family_id, started_at, ends_at)
       select owner_account_id, id, now(), now() + interval '30 days' from families where id = $1`,
      [familyId],
    );

    const auditOk = await alice.request('GET', `/api/v1/families/${familyId}/audit-events`);
    expect(auditOk.statusCode).toBe(200);
    const auditItems = auditOk.json<{ items: { action: string }[] }>().items;
    expect(auditItems.some((item) => item.action === 'house.guide_entry.updated')).toBe(true);

    const parentAudit = await parent.request('GET', `/api/v1/families/${familyId}/audit-events`);
    expect(parentAudit.statusCode).toBe(403);
    expect(problem(parentAudit).code).toBe('forbidden');

    const history = await alice.request(
      'GET',
      `/api/v1/families/${familyId}/revisions?resourceType=house_guide_entries&resourceId=${ENTRY_ID}`,
    );
    const first = history.json<{ items: Revision[] }>().items.find((item) => item.op === 'create');
    expect(first).toBeDefined();

    const restored = await alice.create(`/api/v1/families/${familyId}/revisions/${first!.id}/restore`, {});
    expect(restored.statusCode).toBe(200);
    expect(restored.json<Revision>().op).toBe('restore');

    const entry = await alice.request(
      'GET',
      `/api/v1/families/${familyId}/houses/${houseId}/guide-entries/${ENTRY_ID}`,
    );
    expect(entry.statusCode).toBe(200);
    expect(entry.json<GuideEntry>().title).toBe('Rete di casa');
    expect(entry.json<GuideEntry>().body).toBe('Prima versione');

    const address = await ctx.app.listen({ host: '127.0.0.1', port: 0 });
    const messages: unknown[] = [];
    const socket = await new Promise<WebSocket>((resolve, reject) => {
      const candidate = new WebSocket(`${address.replace(/^http/, 'ws')}/ws`, [REALTIME_SUBPROTOCOL], {
        headers: {
          origin: ORIGIN,
          cookie: alice.cookieHeader(),
        },
      });
      candidate.once('open', () => {
        resolve(candidate);
      });
      candidate.once('unexpected-response', (_request, response) => {
        reject(new Error(`websocket upgrade HTTP ${String(response.statusCode)}`));
      });
      candidate.once('error', reject);
    });
    expect(alice.cookieHeader().length).toBeGreaterThan(0);
    socket.on('message', (raw) => {
      const text = typeof raw === 'string' ? raw : Buffer.isBuffer(raw) ? raw.toString('utf8') : '';
      messages.push(JSON.parse(text));
    });

    socket.send(JSON.stringify({ type: 'subscribe', channel: `family:${familyId}` }));
    await waitFor(() => messages.some(isSubscribed(`family:${familyId}`)));

    const bump = await alice.request(
      'PATCH',
      `/api/v1/families/${familyId}/houses/${houseId}/guide-entries/${ENTRY_ID}`,
      {
        headers: { 'if-match': formatEtag(entry.json<GuideEntry>().version) },
        body: { title: 'Rete live' },
      },
    );
    expect(bump.statusCode).toBe(200);

    await waitFor(() =>
      messages.some(
        (item) =>
          typeof item === 'object' &&
          item !== null &&
          (item as { type?: string }).type === 'event' &&
          (item as { event?: { resource?: string } }).event?.resource === 'house_guide_entries',
      ),
    );
    socket.close();
  });
});

function isSubscribed(channel: string): (item: unknown) => boolean {
  return (item) =>
    typeof item === 'object' &&
    item !== null &&
    (item as { type?: string }).type === 'subscribed' &&
    (item as { channel?: string }).channel === channel;
}

function waitFor(predicate: () => boolean, timeoutMs = 5_000): Promise<void> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = (): void => {
      if (predicate()) {
        resolve();
        return;
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error('timeout waiting for websocket message'));
        return;
      }
      setTimeout(tick, 25);
    };
    tick();
  });
}
