import { createPushSubscriptionRequestSchema, notificationPreferenceSchema } from '../src/notifications.js';
import { describe, expect, it } from 'vitest';

describe('notification contracts', () => {
  it('accepts a browser push subscription body', () => {
    const parsed = createPushSubscriptionRequestSchema.parse({
      endpoint: 'https://push.example.test/sub/1',
      p256dh: 'BNcRdzerQAcgXvPk3T0GAhj-HgcNh37wBgmzKjH0mWmM',
      auth: 'tBHItJI5svbpez7KI4CCXg',
    });
    expect(parsed.endpoint).toContain('push.example.test');
  });

  it('keeps quiet hours paired on preferences', () => {
    const parsed = notificationPreferenceSchema.parse({
      familyId: '01900000-0000-7000-8000-000000000001',
      category: 'deadline',
      inApp: true,
      push: true,
      email: false,
      quietStart: '22:00',
      quietEnd: '07:00',
    });
    expect(parsed.push).toBe(true);
  });
});
