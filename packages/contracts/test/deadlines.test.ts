import { describe, expect, it } from 'vitest';
import {
  calendarDateInTimeZone,
  deadlineGroup,
  endOfMonth,
  endOfWeek,
  successionCalendarDate,
} from '../src/index.js';

describe('deadline groups', () => {
  it('uses the family time zone, not UTC', () => {
    const instant = new Date('2026-11-04T23:30:00.000Z');
    expect(calendarDateInTimeZone(instant, 'Europe/Rome')).toBe('2026-11-05');
    expect(calendarDateInTimeZone(instant, 'America/New_York')).toBe('2026-11-04');
  });

  it('splits a Wednesday into overdue, this week and the rest of the month', () => {
    const today = '2026-11-04';
    expect(endOfWeek(today)).toBe('2026-11-08');
    expect(endOfMonth(today)).toBe('2026-11-30');
    expect(deadlineGroup('2026-11-03', today)).toBe('overdue');
    expect(deadlineGroup('2026-11-04', today)).toBe('week');
    expect(deadlineGroup('2026-11-08', today)).toBe('week');
    expect(deadlineGroup('2026-11-09', today)).toBe('month');
    expect(deadlineGroup('2026-11-30', today)).toBe('month');
    expect(deadlineGroup('2026-12-01', today)).toBeNull();
  });

  it('keeps the days after Sunday in this month, and keeps a week that crosses into the next month', () => {
    expect(deadlineGroup('2026-11-08', '2026-11-08')).toBe('week');
    expect(deadlineGroup('2026-11-09', '2026-11-08')).toBe('month');
    expect(deadlineGroup('2026-11-30', '2026-11-30')).toBe('week');
    expect(deadlineGroup('2026-12-06', '2026-11-30')).toBe('week');
    expect(deadlineGroup('2026-12-07', '2026-11-30')).toBeNull();
  });

  it('reads a succession reminder only when it is a real date', () => {
    expect(successionCalendarDate(null)).toBeNull();
    expect(successionCalendarDate('Entro dodici mesi')).toBeNull();
    expect(successionCalendarDate('2026-02-31')).toBeNull();
    expect(successionCalendarDate(' 2026-11-04 ')).toBe('2026-11-04');
  });
});
