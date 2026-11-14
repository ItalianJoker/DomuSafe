import type { CalendarOccurrence } from './calendar.js';
import { shiftCalendarDate } from './deadlines.js';

/**
 * Escapes text for a calendar-file property value (RFC 5545 §3.3.11).
 *
 * Preconditions: none.
 * Postconditions: backslash, semicolon, comma and newlines are escaped.
 * Data contract: the result is a single line fragment without folding.
 *
 * @param value - Raw text.
 * @returns Escaped text.
 */
export function escapeIcsText(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,')
    .replaceAll(/\r\n|\n|\r/g, '\\n');
}

/**
 * Folds a calendar-file content line to at most 75 octets (RFC 5545 §3.1).
 *
 * Preconditions: `line` has no CR/LF.
 * Postconditions: continuation lines start with a single space.
 * Data contract: UTF-8 octets are counted; multi-byte characters are not split mid-code-unit.
 *
 * @param line - One logical line.
 * @returns Folded lines joined by CRLF without a trailing CRLF on the last piece alone.
 */
export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) {
    return line;
  }
  const parts: string[] = [];
  let remaining = line;
  let first = true;
  while (remaining.length > 0) {
    const budget = first ? 75 : 74;
    let cut = 0;
    let bytes = 0;
    for (const char of remaining) {
      const size = encoder.encode(char).length;
      if (bytes + size > budget && cut > 0) {
        break;
      }
      bytes += size;
      cut += char.length;
    }
    const chunk = remaining.slice(0, cut);
    parts.push(first ? chunk : ` ${chunk}`);
    remaining = remaining.slice(cut);
    first = false;
  }
  return parts.join('\r\n');
}

function compactDate(iso: string): string {
  return iso.replaceAll('-', '');
}

function formatStamp(instant: Date): string {
  return instant
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

function timedValue(date: string, time: string): string {
  return `${compactDate(date)}T${time.replace(':', '')}00`;
}

/**
 * Builds a downloadable calendar file body from board occurrences (RFC 5545).
 *
 * Preconditions: `items` come from the family calendar board; dates are real calendar days.
 * Postconditions: the body is `text/calendar` with CRLF line endings and folded lines.
 * Data contract: all-day events use `VALUE=DATE` with exclusive end date; timed events use floating
 * local date-times in the family zone without a `Z` suffix.
 *
 * @param input - Calendar name, family time zone, stamp and occurrences.
 * @returns The calendar-file body.
 */
export function buildIcsCalendar(input: {
  readonly calendarName: string;
  readonly timezone: string;
  readonly stamp: Date;
  readonly items: readonly CalendarOccurrence[];
}): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DomuSafe//Calendario famiglia//IT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(input.calendarName)}`,
    `X-WR-TIMEZONE:${escapeIcsText(input.timezone)}`,
  ];
  const stamp = formatStamp(input.stamp);
  for (const item of input.items) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${escapeIcsText(`${item.id}@domusafe`)}`);
    lines.push(`DTSTAMP:${stamp}`);
    if (item.allDay || item.startTime === null) {
      lines.push(`DTSTART;VALUE=DATE:${compactDate(item.startDate)}`);
      const exclusiveEnd = shiftCalendarDate(item.endDate, 1);
      lines.push(`DTEND;VALUE=DATE:${compactDate(exclusiveEnd)}`);
    } else {
      const endTime = item.endTime ?? item.startTime;
      lines.push(`DTSTART;TZID=${input.timezone}:${timedValue(item.startDate, item.startTime)}`);
      lines.push(`DTEND;TZID=${input.timezone}:${timedValue(item.endDate, endTime)}`);
    }
    lines.push(`SUMMARY:${escapeIcsText(item.title)}`);
    if (item.description !== null && item.description.length > 0) {
      lines.push(`DESCRIPTION:${escapeIcsText(item.description)}`);
    }
    if (item.location !== null && item.location.length > 0) {
      lines.push(`LOCATION:${escapeIcsText(item.location)}`);
    }
    lines.push(`CATEGORIES:${escapeIcsText(item.kind)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
}
