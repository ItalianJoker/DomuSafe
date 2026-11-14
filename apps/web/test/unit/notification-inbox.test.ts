import { describe, expect, it } from 'vitest';
import { formatNoticeTime, resolveNoticePath } from '../../src/features/notifications/notification-inbox.js';

const FAMILY = '019a0000-0000-7000-8000-000000000001';
const HOUSE = '019a0000-0000-7000-8000-000000000002';

describe('notification inbox helpers', () => {
  it('opens the current house home when the stored path is empty or the root', () => {
    expect(resolveNoticePath(null, FAMILY, HOUSE)).toBe(`/f/${FAMILY}/c/${HOUSE}`);
    expect(resolveNoticePath('/', FAMILY, HOUSE)).toBe(`/f/${FAMILY}/c/${HOUSE}`);
  });

  it('keeps an absolute in-app path', () => {
    expect(resolveNoticePath(`/f/${FAMILY}/c/${HOUSE}/casa`, FAMILY, HOUSE)).toBe(
      `/f/${FAMILY}/c/${HOUSE}/casa`,
    );
  });

  it('maps a section shortcut onto the open house', () => {
    expect(resolveNoticePath('/casa', FAMILY, HOUSE)).toBe(`/f/${FAMILY}/c/${HOUSE}/casa`);
    expect(resolveNoticePath('/famiglia', FAMILY, HOUSE)).toBe(`/f/${FAMILY}/c/${HOUSE}/famiglia`);
  });

  it('formats a valid instant', () => {
    expect(formatNoticeTime('2026-11-14T10:00:00.000Z').length).toBeGreaterThan(0);
    expect(formatNoticeTime('not-a-date')).toBe('');
  });
});
