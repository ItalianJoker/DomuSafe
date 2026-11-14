import { createHmac, randomUUID } from 'node:crypto';
import type {
  CreateHaConnectionResponse,
  HaConnectionPage,
  HaDevicePage,
  HaLockCodePage,
  HaRefreshResult,
  HaZone,
  HaZonePage,
  IssueHaLockCodeResponse,
  ProblemDetails,
} from '@domusafe/contracts';
import { formatEtag } from '@domusafe/contracts';
import type { LightMyRequestResponse } from 'fastify';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MockHomeAutomationAdapter } from '../src/modules/home-automation/mock-adapter.js';
import { Client, createTestApp, type TestApp } from './helpers.js';

const PASSWORD = 'una-password-lunga-42';

let ctx: TestApp;
let admin: pg.Pool;
let alice: Client;
let parent: Client;
let familyId: string;
let houseId: string;

function problem(response: LightMyRequestResponse): ProblemDetails {
  return response.json<ProblemDetails>();
}

function automationBase(): string {
  return `/api/v1/families/${familyId}/houses/${houseId}/automation`;
}

beforeAll(async () => {
  ctx = await createTestApp();
  admin = new pg.Pool({ connectionString: ctx.database.adminUrl, max: 2 });
  alice = new Client(ctx.app);
  parent = new Client(ctx.app);
  await alice.signUp('Alice Domotica', 'alice-domotica@example.test', PASSWORD);
  const parentId = await parent.signUp('Paolo Domotica', 'paolo-domotica@example.test', PASSWORD);
  const created = await alice.create('/api/v1/families', {
    name: 'Famiglia Domotica',
    firstHouse: { name: 'Casa connessa' },
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

describe('home automation bridge', () => {
  it('stays closed below Premium, then configures the bridge with the mock adapter', async () => {
    const blocked = await alice.create(`${automationBase()}/connections`, {
      kind: 'home_assistant_api',
      name: 'Assistente casa',
      baseUrl: 'https://ha.example.test',
      token: 'token-segreto-di-prova-123456',
    });
    expect(blocked.statusCode).toBe(403);
    expect(problem(blocked).code).toBe('two_factor_setup_required');

    await alice.enableTwoFactor(PASSWORD);
    const planBlocked = await alice.create(`${automationBase()}/connections`, {
      kind: 'home_assistant_api',
      name: 'Assistente casa',
      baseUrl: 'https://ha.example.test',
      token: 'token-segreto-di-prova-123456',
    });
    expect(planBlocked.statusCode).toBe(403);
    expect(problem(planBlocked).code).toBe('plan_required');
    expect(problem(planBlocked).requiredPlan).toBe('premium');

    await admin.query(`update families set plan = 'advanced' where id = $1`, [familyId]);
    const advanced = await alice.request('GET', `${automationBase()}/connections`);
    expect(advanced.statusCode).toBe(403);
    expect(problem(advanced).requiredPlan).toBe('premium');

    await admin.query(`update families set plan = 'premium' where id = $1`, [familyId]);

    const createdHa = await alice.create(`${automationBase()}/connections`, {
      kind: 'home_assistant_api',
      name: 'Assistente casa',
      baseUrl: 'https://ha.example.test',
      token: 'token-segreto-di-prova-123456',
    });
    expect(createdHa.statusCode).toBe(201);
    const haBody = createdHa.json<CreateHaConnectionResponse>();
    expect(haBody.connection.hasCredentials).toBe(true);
    expect(haBody.inboundSecret).not.toBeNull();
    expect(haBody.connection.baseUrl).toBe('https://ha.example.test');

    const createdMqtt = await alice.create(`${automationBase()}/connections`, {
      kind: 'mqtt',
      name: 'Broker messaggi',
      mqttUrl: 'mqtts://broker.example.test:8883',
      mqttTopicPrefix: 'domusafe/casa',
      mqttUsername: 'famiglia',
      mqttPassword: 'password-broker-segreta',
    });
    expect(createdMqtt.statusCode).toBe(201);
    const mqttBody = createdMqtt.json<CreateHaConnectionResponse>();
    expect(mqttBody.connection.kind).toBe('mqtt');
    expect(mqttBody.inboundSecret).toBeNull();
    expect(mqttBody.connection.hasCredentials).toBe(true);

    const listed = await alice.request('GET', `${automationBase()}/connections`);
    expect(listed.statusCode).toBe(200);
    expect(listed.json<HaConnectionPage>().items).toHaveLength(2);

    const tested = await alice.create(`${automationBase()}/connections/${haBody.connection.id}/test`, {});
    expect(tested.statusCode).toBe(200);
    expect(tested.json<{ ok: boolean }>().ok).toBe(true);

    const refreshed = await alice.create(
      `${automationBase()}/connections/${haBody.connection.id}/refresh`,
      {},
    );
    expect(refreshed.statusCode).toBe(200);
    const devices = refreshed.json<HaRefreshResult>().devices;
    expect(devices.length).toBeGreaterThanOrEqual(4);
    expect(devices.some((item) => item.kind === 'lock')).toBe(true);
    expect(devices.some((item) => item.kind === 'alarm_panel')).toBe(true);

    const devicePage = await alice.request('GET', `${automationBase()}/devices`);
    expect(devicePage.statusCode).toBe(200);
    expect(devicePage.json<HaDevicePage>().items.length).toBeGreaterThanOrEqual(4);

    const zoneCreated = await alice.create(`${automationBase()}/zones`, {
      name: 'Piano terra',
      externalId: 'alarm_control_panel.casa',
    });
    expect(zoneCreated.statusCode).toBe(201);
    const zone = zoneCreated.json<HaZone>();
    expect(zone.alarmState).toBe('disarmed');

    const armed = await alice.request('PATCH', `${automationBase()}/zones/${zone.id}`, {
      headers: { 'if-match': formatEtag(zone.version) },
      body: { alarmState: 'armed_away' },
    });
    expect(armed.statusCode).toBe(200);
    expect(armed.json<HaZone>().alarmState).toBe('armed_away');

    const zones = await alice.request('GET', `${automationBase()}/zones`);
    expect(zones.json<HaZonePage>().items).toHaveLength(1);

    const lock = devices.find((item) => item.kind === 'lock');
    expect(lock).toBeDefined();
    const validFrom = new Date('2026-11-14T10:00:00.000Z').toISOString();
    const validUntil = new Date('2026-11-14T18:00:00.000Z').toISOString();
    const issued = await alice.create(`${automationBase()}/devices/${lock!.id}/lock-codes`, {
      label: 'Ospite weekend',
      validFrom,
      validUntil,
    });
    expect(issued.statusCode).toBe(201);
    const lockBody = issued.json<IssueHaLockCodeResponse>();
    expect(lockBody.code).toMatch(/^\d{6}$/);
    expect(lockBody.lockCode.codeSuffix).toBe(lockBody.code.slice(-2));

    const codes = await alice.request('GET', `${automationBase()}/lock-codes`);
    expect(codes.statusCode).toBe(200);
    expect(codes.json<HaLockCodePage>().items).toHaveLength(1);

    const parentList = await parent.request('GET', `${automationBase()}/devices`);
    expect(parentList.statusCode).toBe(200);

    const parentManage = await parent.create(`${automationBase()}/connections`, {
      kind: 'mqtt',
      name: 'Altro broker',
      mqttUrl: 'mqtts://other.example.test:8883',
      mqttPassword: 'altra-password',
    });
    expect(parentManage.statusCode).toBe(403);

    const mock = new MockHomeAutomationAdapter();
    const probe = await mock.testConnection({
      kind: 'home_assistant_api',
      baseUrl: 'https://ha.example.test',
      token: 'x',
      mqttUrl: null,
      mqttTopicPrefix: null,
      mqttUsername: null,
      mqttPassword: null,
    });
    expect(probe.ok).toBe(true);
  });

  it('accepts a signed Home Assistant webhook and updates device status', async () => {
    await admin.query(`update families set plan = 'premium' where id = $1`, [familyId]);
    const created = await alice.create(`${automationBase()}/connections`, {
      kind: 'home_assistant_webhook',
      name: 'Webhook casa',
      baseUrl: 'https://ha.example.test',
    });
    expect(created.statusCode).toBe(201);
    const body = created.json<CreateHaConnectionResponse>();
    const secret = body.inboundSecret;
    expect(secret).not.toBeNull();

    const payload = {
      events: [
        {
          entityId: 'sensor.cucina_temperatura',
          state: '22.0',
          value: 22,
          unit: '°C',
          occurredAt: new Date().toISOString(),
          attributes: { friendly_name: 'Temperatura cucina' },
        },
      ],
    };
    const raw = JSON.stringify(payload);
    const timestamp = String(Date.now());
    const eventId = randomUUID();
    const signature = `v1=${createHmac('sha256', secret!).update(`${timestamp}.${raw}`).digest('hex')}`;

    const response = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/public/webhooks/home-assistant/${body.connection.id}`,
      headers: {
        'content-type': 'application/json',
        'x-domusafe-timestamp': timestamp,
        'x-domusafe-event-id': eventId,
        'x-domusafe-signature': signature,
      },
      payload: raw,
    });
    expect(response.statusCode).toBe(202);

    const devices = await alice.request('GET', `${automationBase()}/devices`);
    expect(devices.statusCode).toBe(200);
    expect(
      devices.json<HaDevicePage>().items.some((item) => item.externalId === 'sensor.cucina_temperatura'),
    ).toBe(true);
  });
});
