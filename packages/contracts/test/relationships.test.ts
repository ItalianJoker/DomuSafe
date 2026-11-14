import { describe, expect, it } from 'vitest';
import { relationshipReminder, shiftCalendarDate } from '../src/index.js';

describe('ethical relationship reminders', () => {
  it('derives overdue, due and upcoming only from last contact and interval', () => {
    const today = '2026-11-14';
    expect(relationshipReminder(null, 14, today)).toEqual({
      nextReminderOn: null,
      reminderState: 'none',
    });
    expect(relationshipReminder('2026-11-01', null, today)).toEqual({
      nextReminderOn: null,
      reminderState: 'none',
    });
    expect(relationshipReminder('2026-10-20', 14, today)).toEqual({
      nextReminderOn: shiftCalendarDate('2026-10-20', 14),
      reminderState: 'overdue',
    });
    expect(relationshipReminder(shiftCalendarDate(today, -7), 7, today)).toEqual({
      nextReminderOn: today,
      reminderState: 'due',
    });
    expect(relationshipReminder(today, 14, today)).toEqual({
      nextReminderOn: shiftCalendarDate(today, 14),
      reminderState: 'upcoming',
    });
  });
});
