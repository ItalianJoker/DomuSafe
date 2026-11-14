import { describe, expect, it } from 'vitest';
import { resolveNoticePath } from '../../src/features/notifications/notification-inbox.js';

const FAMILY = '019a0000-0000-7000-8000-000000000001';
const HOUSE = '019a0000-0000-7000-8000-000000000002';

describe('news feed deep links', () => {
  it('opens the dashboard for catalogue tips that point at the root', () => {
    expect(resolveNoticePath('/', FAMILY, HOUSE)).toBe(`/f/${FAMILY}/c/${HOUSE}`);
  });

  it('opens Casa and Famiglia from section shortcuts seeded in news_items', () => {
    expect(resolveNoticePath('/casa', FAMILY, HOUSE)).toBe(`/f/${FAMILY}/c/${HOUSE}/casa`);
    expect(resolveNoticePath('/famiglia', FAMILY, HOUSE)).toBe(`/f/${FAMILY}/c/${HOUSE}/famiglia`);
  });
});
