import { describe, expect, it } from 'vitest';
import {
  buildIcsCalendar,
  calendarBoardQuerySchema,
  escapeIcsText,
  foldIcsLine,
  isValidCalendarRange,
} from '../src/index.js';

describe('calendar range', () => {
  it('accepts up to 366 inclusive days and rejects inverted ranges', () => {
    expect(isValidCalendarRange('2026-01-01', '2026-01-01')).toBe(true);
    expect(isValidCalendarRange('2026-01-01', '2026-12-31')).toBe(true);
    expect(isValidCalendarRange('2026-01-01', '2027-01-01')).toBe(true);
    expect(isValidCalendarRange('2026-01-01', '2027-01-02')).toBe(false);
    expect(isValidCalendarRange('2026-02-01', '2026-01-01')).toBe(false);
    expect(
      calendarBoardQuerySchema.safeParse({
        from: '2026-01-01',
        to: '2026-01-10',
        houseId: '01900000-0000-7000-8000-000000000001',
      }).success,
    ).toBe(true);
  });
});

describe('calendar file builder', () => {
  it('escapes text, folds long lines and emits all-day and timed events', () => {
    expect(escapeIcsText('A;B,C\\D\nE')).toBe('A\\;B\\,C\\\\D\\nE');
    const folded = foldIcsLine(`SUMMARY:${'x'.repeat(90)}`);
    expect(folded.includes('\r\n ')).toBe(true);

    const body = buildIcsCalendar({
      calendarName: 'Famiglia Rossi',
      timezone: 'Europe/Rome',
      stamp: new Date('2026-11-14T12:00:00.000Z'),
      items: [
        {
          id: 'event:1',
          kind: 'event',
          sourceId: '01900000-0000-7000-8000-000000000001',
          title: 'Visita, pediatra',
          description: 'Portare cartella',
          location: 'Ambulatorio',
          startDate: '2026-11-20',
          endDate: '2026-11-20',
          startTime: '10:30',
          endTime: '11:00',
          allDay: false,
          category: 'health',
          deadlineKind: null,
          houseId: null,
          residentIds: [],
          version: 1,
        },
        {
          id: 'deadline:2',
          kind: 'deadline',
          sourceId: '01900000-0000-7000-8000-000000000002',
          title: 'Controllo caldaia',
          description: null,
          location: null,
          startDate: '2026-11-21',
          endDate: '2026-11-21',
          startTime: null,
          endTime: null,
          allDay: true,
          category: null,
          deadlineKind: 'maintenance',
          houseId: '01900000-0000-7000-8000-000000000003',
          residentIds: [],
          version: null,
        },
      ],
    });
    expect(body).toContain('BEGIN:VCALENDAR');
    expect(body).toContain('SUMMARY:Visita\\, pediatra');
    expect(body).toContain('DTSTART;TZID=Europe/Rome:20261120T103000');
    expect(body).toContain('DTSTART;VALUE=DATE:20261121');
    expect(body).toContain('DTEND;VALUE=DATE:20261122');
    expect(body.endsWith('\r\n')).toBe(true);
  });
});
