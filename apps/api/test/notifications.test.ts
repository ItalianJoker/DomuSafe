import {
  calendarDateInTimeZone,
  shiftCalendarDate,
  type Me,
  type NotificationPreferenceList,
  type PushSubscription,
} from '@domusafe/contracts';
import { toBase64Url, uuidv7 } from '@domusafe/crypto';
import { createDatabase, createPool } from '@domusafe/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRecordingPushSender } from '../src/modules/notifications/push.js';
import { createNotificationsService } from '../src/modules/notifications/service.js';
import { createTenancyService } from '../src/modules/tenancy/service.js';
import { Client, createTestApp, TEST_VAPID, type TestApp } from './helpers.js';

const PASSWORD = 'una-password-lunga-42';

let ctx: TestApp;
let alice: Client;
let familyId: string;
let houseId: string;

beforeAll(async () => {
  const recording = createRecordingPushSender();
  ctx = await createTestApp({ pushSender: recording.sender });
  alice = new Client(ctx.app);
  await alice.signUp('Alice Rossi', 'alice-push@example.test', PASSWORD);
  const created = await alice.create('/api/v1/families', {
    name: 'Famiglia Push',
    firstHouse: { name: 'Casa push' },
  });
  expect(created.statusCode).toBe(201);
  const body = created.json<{ family: { id: string }; house: { id: string } }>();
  familyId = body.family.id;
  houseId = body.house.id;
});

afterAll(async () => {
  await ctx.close();
});

describe('browser push and deadline alerts', () => {
  it('exposes the public push key on the account profile', async () => {
    const me = await alice.request('GET', '/api/v1/me');
    expect(me.statusCode).toBe(200);
    expect(me.json<Me>().vapidPublicKey).toBe(TEST_VAPID.publicKey);
  });

  it('registers a browser subscription, stores deadline preference and delivers a push', async () => {
    const endpoint = `https://push.example.test/subscription/${uuidv7()}`;
    const p256dhBytes = cryptoRandom(65);
    p256dhBytes[0] = 4;
    const p256dh = toBase64Url(p256dhBytes);
    const auth = toBase64Url(cryptoRandom(16));

    const created = await alice.create('/api/v1/me/push-subscriptions', {
      endpoint,
      p256dh,
      auth,
    });
    expect(created.statusCode).toBe(201);
    const subscription = created.json<PushSubscription>();
    expect(subscription.endpoint).toBe(endpoint);
    expect(subscription.disabledAt).toBeNull();

    const prefs = await alice.request('PUT', '/api/v1/me/notification-preferences', {
      body: {
        items: [
          {
            familyId,
            category: 'deadline',
            inApp: true,
            push: true,
            email: false,
            quietStart: null,
            quietEnd: null,
          },
        ],
      },
    });
    expect(prefs.statusCode).toBe(200);
    const list = prefs.json<NotificationPreferenceList>();
    expect(list.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ familyId, category: 'deadline', push: true, inApp: true }),
      ]),
    );

    const today = calendarDateInTimeZone(new Date(), 'Europe/Rome');
    const overdue = shiftCalendarDate(today, -3);
    const task = await alice.create(`/api/v1/families/${familyId}/houses/${houseId}/maintenance-tasks`, {
      title: 'Controllo caldaia',
      category: 'heating',
      nextDueDate: overdue,
      active: true,
    });
    expect(task.statusCode).toBe(201);
    const taskId = task.json<{ id: string }>().id;

    const recording = createRecordingPushSender();
    const pool = createPool(ctx.database.appUrl, { max: 2, applicationName: 'domusafe-test-worker' });
    const db = createDatabase(pool);
    const notifications = createNotificationsService(
      db,
      createTenancyService(db),
      { vapidPublicKey: TEST_VAPID.publicKey, pushSender: recording.sender },
      () => new Date(),
    );
    const summary = await notifications.processDeadlineAlerts();
    expect(summary.notifications).toBeGreaterThanOrEqual(1);
    expect(summary.pushDelivered).toBeGreaterThanOrEqual(1);
    expect(recording.deliveries.some((delivery) => delivery.payload.body.includes('Controllo caldaia'))).toBe(
      true,
    );

    const inbox = await alice.request('GET', '/api/v1/me/notifications?unreadOnly=true');
    expect(inbox.statusCode).toBe(200);
    const items = inbox.json<{ items: { resourceId: string | null; category: string }[] }>().items;
    expect(items.some((item) => item.category === 'deadline' && item.resourceId === taskId)).toBe(true);

    const again = await notifications.processDeadlineAlerts();
    expect(again.notifications).toBe(0);

    const removed = await alice.request('DELETE', `/api/v1/me/push-subscriptions/${subscription.id}`);
    expect(removed.statusCode).toBe(204);
    expect(
      (await alice.request('DELETE', `/api/v1/me/push-subscriptions/${subscription.id}`)).statusCode,
    ).toBe(204);

    await pool.end();
  });
});

function cryptoRandom(length: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(length);
  crypto.getRandomValues(out);
  return out;
}
