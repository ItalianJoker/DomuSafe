import { describe, expect, it } from 'vitest';
import {
  casaTabs,
  localDate,
  rruleToWeekdays,
  telHref,
  uuidv7,
  weekdaysToRrule,
} from '../../src/features/casa/model.js';

describe('casa tabs', () => {
  it('keeps utilities on the free administrator and hides them from a guest', () => {
    expect(casaTabs('admin')).toEqual(['guest', 'technical', 'utilities', 'deadline', 'houses']);
    expect(casaTabs('guest')).toEqual(['guest', 'houses']);
    expect(casaTabs('child')).toEqual(['guest', 'technical', 'deadline', 'houses']);
  });
});

describe('waste recurrence', () => {
  it('round-trips the selected weekdays', () => {
    expect(weekdaysToRrule(['FR', 'MO'])).toBe('FREQ=WEEKLY;BYDAY=MO,FR');
    expect(rruleToWeekdays('FREQ=WEEKLY;BYDAY=MO,FR')).toEqual(['MO', 'FR']);
    expect(weekdaysToRrule([])).toBeNull();
  });
});

describe('safety phone link', () => {
  it('accepts only an international number', () => {
    expect(telHref('+393331112233')).toBe('tel:+393331112233');
    expect(telHref('3331112233')).toBeNull();
    expect(telHref(null)).toBeNull();
  });
});

describe('browser identifiers', () => {
  it('builds a version-7 identifier and a calendar date', () => {
    expect(uuidv7(1_700_000_000_000)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(localDate(new Date(2026, 10, 4))).toBe('2026-11-04');
  });
});
