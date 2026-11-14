import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { CalendarOccurrence } from '@domusafe/contracts';
import { useApi } from '@/components/api-context.js';
import { Field } from '@/components/shell/page.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { problemText } from '@/lib/copy.js';
import { calendarBoardQuery, residentsQuery } from '@/lib/queries.js';
import { m } from '@/paraglide/messages.js';

function todayLocal(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${String(now.getFullYear())}-${month}-${day}`;
}

function shiftLocalDate(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function weekdayLabel(weekday: number): string {
  switch (weekday) {
    case 1:
      return m.calendarWeekdayMon();
    case 2:
      return m.calendarWeekdayTue();
    case 3:
      return m.calendarWeekdayWed();
    case 4:
      return m.calendarWeekdayThu();
    case 5:
      return m.calendarWeekdayFri();
    case 6:
      return m.calendarWeekdaySat();
    default:
      return m.calendarWeekdaySun();
  }
}

function kindLabel(kind: CalendarOccurrence['kind']): string {
  switch (kind) {
    case 'event':
      return m.calendarKindEvent();
    case 'chore':
      return m.calendarKindChore();
    case 'deadline':
      return m.calendarKindDeadline();
    case 'timetable':
      return m.calendarKindTimetable();
  }
}

function groupByDate(items: readonly CalendarOccurrence[]): readonly {
  readonly date: string;
  readonly items: readonly CalendarOccurrence[];
}[] {
  const map = new Map<string, CalendarOccurrence[]>();
  for (const item of items) {
    const list = map.get(item.startDate) ?? [];
    list.push(item);
    map.set(item.startDate, list);
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, group]) => ({ date, items: group }));
}

function downloadCalendarFile(filename: string, body: string): void {
  const blob = new Blob([body], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/**
 * Family calendar of appointments, weekly schedules, chores and deadlines, with calendar-file download.
 * Lazy-loaded under Famiglia so the shell gzip budget stays intact.
 *
 * Preconditions: the caller may read the calendar. `canWrite` gates create forms.
 * Postconditions: new appointments and weekly slots persist in Postgres.
 * Data contract: the board mixes stored events with chores and deadlines already saved elsewhere.
 *
 * @param props - Family, house and write permission.
 * @returns The panel.
 */
export function CalendarPanel(props: {
  readonly familyId: string;
  readonly houseId: string;
  readonly canWrite: boolean;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const from = todayLocal();
  const to = shiftLocalDate(from, 30);
  const board = useQuery(calendarBoardQuery(api, props.familyId, props.houseId, from, to));
  const residents = useQuery({
    ...residentsQuery(api, props.familyId, props.houseId),
    enabled: props.canWrite,
  });
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(from);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [allDay, setAllDay] = useState(false);
  const [slotTitle, setSlotTitle] = useState('');
  const [slotResident, setSlotResident] = useState('');
  const [slotWeekday, setSlotWeekday] = useState('1');
  const [slotStart, setSlotStart] = useState('15:00');
  const [slotEnd, setSlotEnd] = useState('16:00');
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    await queryClient.invalidateQueries({
      queryKey: calendarBoardQuery(api, props.familyId, props.houseId, from, to).queryKey,
    });
  }

  async function addEvent(): Promise<void> {
    if (title.trim() === '' || date === '') {
      setError(m.fieldRequired());
      return;
    }
    setPending(true);
    setSaved(false);
    setError(null);
    try {
      const startsAt = allDay ? `${date}T00:00:00.000Z` : `${date}T${startTime}:00.000Z`;
      const endsAt = allDay ? `${date}T23:59:59.000Z` : `${date}T${endTime}:00.000Z`;
      await api.createCalendarEvent(props.familyId, crypto.randomUUID(), {
        title: title.trim(),
        startsAt,
        endsAt,
        allDay,
        category: 'other',
        houseId: props.houseId,
        visibility: 'family',
      });
      setTitle('');
      await refresh();
      setSaved(true);
    } catch (caught) {
      setError(problemText(caught));
    } finally {
      setPending(false);
    }
  }

  async function addSlot(): Promise<void> {
    if (slotTitle.trim() === '' || slotResident === '') {
      setError(m.fieldRequired());
      return;
    }
    setPending(true);
    setSaved(false);
    setError(null);
    try {
      await api.createTimetableSlot(props.familyId, crypto.randomUUID(), {
        residentId: slotResident,
        weekday: Number(slotWeekday),
        startsAt: slotStart,
        endsAt: slotEnd,
        title: slotTitle.trim(),
      });
      setSlotTitle('');
      await refresh();
      setSaved(true);
    } catch (caught) {
      setError(problemText(caught));
    } finally {
      setPending(false);
    }
  }

  async function download(): Promise<void> {
    setPending(true);
    setError(null);
    try {
      const file = await api.exportCalendar(props.familyId, props.houseId, from, to);
      downloadCalendarFile(file.filename, file.body);
    } catch (caught) {
      setError(problemText(caught));
    } finally {
      setPending(false);
    }
  }

  const groups = board.data === undefined ? [] : groupByDate(board.data.items);

  return (
    <section className="grid max-w-xl gap-6">
      <header>
        <h2 className="text-[15px] font-medium tracking-tight">{m.calendarTitle()}</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{m.calendarLead()}</p>
        <p className="mt-1 text-[12px] text-muted-foreground">{m.calendarRange({ from, to })}</p>
      </header>

      <Button size="emergency" disabled={pending || board.isLoading} onClick={() => void download()}>
        {m.calendarDownload()}
      </Button>

      {board.isError ? <p className="text-[13px] text-destructive">{problemText(board.error)}</p> : null}
      {error !== null ? <p className="text-[13px] text-destructive">{error}</p> : null}
      {saved ? <p className="text-[13px] text-muted-foreground">{m.saved()}</p> : null}

      <div className="grid gap-4">
        {groups.length === 0 && !board.isLoading ? (
          <p className="text-[13px] text-muted-foreground">{m.calendarNone()}</p>
        ) : null}
        {groups.map((group) => (
          <div key={group.date}>
            <h3 className="mb-2 text-[13px] font-medium">{group.date}</h3>
            <ul className="divide-y divide-border border-y border-border">
              {group.items.map((item) => (
                <li
                  key={item.id}
                  className="flex min-h-12 items-start justify-between gap-3 py-2 text-[13px]"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{item.title}</p>
                    <p className="text-[12px] text-muted-foreground">
                      {kindLabel(item.kind)}
                      {item.allDay || item.startTime === null
                        ? ` · ${m.calendarAllDay()}`
                        : ` · ${item.startTime}${item.endTime === null ? '' : `–${item.endTime}`}`}
                      {item.location === null ? '' : ` · ${item.location}`}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {props.canWrite ? (
        <div className="grid gap-3">
          <h3 className="text-[13px] font-medium">{m.calendarAddEvent()}</h3>
          <Field htmlFor="calendar-title" label={m.calendarEventTitle()}>
            <Input id="calendar-title" value={title} onChange={(event) => setTitle(event.target.value)} />
          </Field>
          <Field htmlFor="calendar-date" label={m.calendarEventDate()}>
            <Input
              id="calendar-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </Field>
          <label className="flex min-h-12 items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(event) => setAllDay(event.target.checked)}
              className="size-4"
            />
            {m.calendarAllDay()}
          </label>
          {allDay ? null : (
            <div className="grid grid-cols-2 gap-3">
              <Field htmlFor="calendar-start" label={m.calendarStartTime()}>
                <Input
                  id="calendar-start"
                  type="time"
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                />
              </Field>
              <Field htmlFor="calendar-end" label={m.calendarEndTime()}>
                <Input
                  id="calendar-end"
                  type="time"
                  value={endTime}
                  onChange={(event) => setEndTime(event.target.value)}
                />
              </Field>
            </div>
          )}
          <Button disabled={pending} onClick={() => void addEvent()}>
            {m.calendarSaveEvent()}
          </Button>
        </div>
      ) : null}

      {props.canWrite ? (
        <div className="grid gap-3">
          <h3 className="text-[13px] font-medium">{m.calendarAddTimetable()}</h3>
          <Field htmlFor="calendar-slot-title" label={m.calendarSlotTitle()}>
            <Input
              id="calendar-slot-title"
              value={slotTitle}
              onChange={(event) => setSlotTitle(event.target.value)}
            />
          </Field>
          <Field htmlFor="calendar-slot-resident" label={m.calendarSlotResident()}>
            <Select value={slotResident} onValueChange={setSlotResident}>
              <SelectTrigger id="calendar-slot-resident" className="min-h-12">
                <SelectValue placeholder={m.calendarSlotResident()} />
              </SelectTrigger>
              <SelectContent>
                {(residents.data ?? []).map((resident) => (
                  <SelectItem key={resident.id} value={resident.id}>
                    {resident.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field htmlFor="calendar-slot-weekday" label={m.calendarSlotWeekday()}>
            <Select value={slotWeekday} onValueChange={setSlotWeekday}>
              <SelectTrigger id="calendar-slot-weekday" className="min-h-12">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5, 6, 7].map((day) => (
                  <SelectItem key={day} value={String(day)}>
                    {weekdayLabel(day)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field htmlFor="calendar-slot-start" label={m.calendarStartTime()}>
              <Input
                id="calendar-slot-start"
                type="time"
                value={slotStart}
                onChange={(event) => setSlotStart(event.target.value)}
              />
            </Field>
            <Field htmlFor="calendar-slot-end" label={m.calendarEndTime()}>
              <Input
                id="calendar-slot-end"
                type="time"
                value={slotEnd}
                onChange={(event) => setSlotEnd(event.target.value)}
              />
            </Field>
          </div>
          <Button disabled={pending} onClick={() => void addSlot()}>
            {m.calendarSaveTimetable()}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
