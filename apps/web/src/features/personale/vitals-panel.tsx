import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { VitalEntry } from '@domusafe/contracts';
import { useApi } from '@/components/api-context.js';
import { Field } from '@/components/shell/page.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Textarea } from '@/components/ui/textarea.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { problemText } from '@/lib/copy.js';
import { residentsQuery, vitalsQuery } from '@/lib/queries.js';
import { m } from '@/paraglide/messages.js';

interface VitalDraft {
  measuredAt: string;
  systolicMmhg: string;
  diastolicMmhg: string;
  heartRateBpm: string;
  temperatureCelsius: string;
  bloodGlucoseMgDl: string;
  weightKg: string;
  oxygenSaturationPercent: string;
  notes: string;
}

function emptyDraft(): VitalDraft {
  const now = new Date();
  const pad = (value: number): string => String(value).padStart(2, '0');
  const local = `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  return {
    measuredAt: local,
    systolicMmhg: '',
    diastolicMmhg: '',
    heartRateBpm: '',
    temperatureCelsius: '',
    bloodGlucoseMgDl: '',
    weightKg: '',
    oxygenSaturationPercent: '',
    notes: '',
  };
}

function parseOptionalInt(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseOptionalFloat(value: string): number | null {
  const trimmed = value.trim().replace(',', '.');
  if (trimmed === '') {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString();
}

function summary(entry: VitalEntry): string {
  const parts: string[] = [];
  if (entry.systolicMmhg !== null && entry.diastolicMmhg !== null) {
    parts.push(`${String(entry.systolicMmhg)}/${String(entry.diastolicMmhg)}`);
  }
  if (entry.heartRateBpm !== null) {
    parts.push(String(entry.heartRateBpm));
  }
  if (entry.temperatureCelsius !== null) {
    parts.push(String(entry.temperatureCelsius));
  }
  if (entry.bloodGlucoseMgDl !== null) {
    parts.push(String(entry.bloodGlucoseMgDl));
  }
  if (entry.weightKg !== null) {
    parts.push(String(entry.weightKg));
  }
  if (entry.oxygenSaturationPercent !== null) {
    parts.push(`${String(entry.oxygenSaturationPercent)} %`);
  }
  if (entry.notes !== null && entry.notes.length > 0) {
    parts.push(entry.notes);
  }
  return parts.join(' · ');
}

/**
 * Vital parameters diary for people in the open house.
 *
 * Preconditions: the caller can read health data. Writes require `health.write`.
 * Postconditions: new rows are appended; deletion uses If-Match.
 * Data contract: at least one measurement or a note is required.
 *
 * @param props - Family, house and whether the person may edit.
 * @returns The tab.
 */
export function VitalsPanel(props: {
  readonly familyId: string;
  readonly houseId: string;
  readonly canWrite: boolean;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const people = useQuery(residentsQuery(api, props.familyId, props.houseId));
  const [selected, setSelected] = useState<string | null>(null);
  const residentId = selected ?? people.data?.[0]?.id ?? null;
  const vitals = useQuery({
    ...vitalsQuery(api, props.familyId, residentId ?? ''),
    enabled: residentId !== null,
  });
  const [draft, setDraft] = useState(emptyDraft);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    if (residentId !== null) {
      await queryClient.invalidateQueries({ queryKey: ['vitals', props.familyId, residentId] });
    }
  }

  async function add(): Promise<void> {
    if (residentId === null) {
      return;
    }
    const systolicMmhg = parseOptionalInt(draft.systolicMmhg);
    const diastolicMmhg = parseOptionalInt(draft.diastolicMmhg);
    const heartRateBpm = parseOptionalInt(draft.heartRateBpm);
    const temperatureCelsius = parseOptionalFloat(draft.temperatureCelsius);
    const bloodGlucoseMgDl = parseOptionalInt(draft.bloodGlucoseMgDl);
    const weightKg = parseOptionalFloat(draft.weightKg);
    const oxygenSaturationPercent = parseOptionalInt(draft.oxygenSaturationPercent);
    const notes = draft.notes.trim() === '' ? null : draft.notes.trim();
    if (
      systolicMmhg === null &&
      heartRateBpm === null &&
      temperatureCelsius === null &&
      bloodGlucoseMgDl === null &&
      weightKg === null &&
      oxygenSaturationPercent === null &&
      notes === null
    ) {
      setError(m.vitalsNeedValue());
      return;
    }
    const measured = new Date(draft.measuredAt);
    if (Number.isNaN(measured.getTime())) {
      setError(m.vitalsNeedValue());
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api.createVital(props.familyId, residentId, crypto.randomUUID(), {
        measuredAt: measured.toISOString(),
        systolicMmhg,
        diastolicMmhg,
        heartRateBpm,
        temperatureCelsius,
        bloodGlucoseMgDl,
        weightKg,
        oxygenSaturationPercent,
        notes,
      });
      setDraft(emptyDraft());
      await refresh();
    } catch (caught) {
      setError(problemText(caught));
    } finally {
      setPending(false);
    }
  }

  async function remove(entry: VitalEntry): Promise<void> {
    if (residentId === null) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api.deleteVital(props.familyId, residentId, entry.id, entry.version);
      await refresh();
    } catch (caught) {
      setError(problemText(caught));
    } finally {
      setPending(false);
    }
  }

  if ((people.data?.length ?? 0) === 0) {
    return <p className="text-[13px] text-muted-foreground">{m.personaleNone()}</p>;
  }

  return (
    <div className="grid gap-6">
      <div>
        <h2 className="text-[13px] font-medium">{m.vitalsTitle()}</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">{m.vitalsLead()}</p>
      </div>
      {(people.data?.length ?? 0) > 1 ? (
        <Field label={m.personalePick()} htmlFor="vitals-pick">
          <Select value={residentId ?? ''} onValueChange={setSelected}>
            <SelectTrigger id="vitals-pick">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(people.data ?? []).map((person) => (
                <SelectItem key={person.id} value={person.id}>
                  {person.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      ) : null}

      {props.canWrite ? (
        <div className="grid max-w-xl gap-3">
          <Field label={m.vitalsMeasuredAt()} htmlFor="vitals-when">
            <Input
              id="vitals-when"
              type="datetime-local"
              value={draft.measuredAt}
              disabled={pending}
              onChange={(event) => setDraft({ ...draft, measuredAt: event.target.value })}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={m.vitalsSystolic()} htmlFor="vitals-sys">
              <Input
                id="vitals-sys"
                inputMode="numeric"
                value={draft.systolicMmhg}
                disabled={pending}
                onChange={(event) => setDraft({ ...draft, systolicMmhg: event.target.value })}
              />
            </Field>
            <Field label={m.vitalsDiastolic()} htmlFor="vitals-dia">
              <Input
                id="vitals-dia"
                inputMode="numeric"
                value={draft.diastolicMmhg}
                disabled={pending}
                onChange={(event) => setDraft({ ...draft, diastolicMmhg: event.target.value })}
              />
            </Field>
            <Field label={m.vitalsHeartRate()} htmlFor="vitals-hr">
              <Input
                id="vitals-hr"
                inputMode="numeric"
                value={draft.heartRateBpm}
                disabled={pending}
                onChange={(event) => setDraft({ ...draft, heartRateBpm: event.target.value })}
              />
            </Field>
            <Field label={m.vitalsTemperature()} htmlFor="vitals-temp">
              <Input
                id="vitals-temp"
                inputMode="decimal"
                value={draft.temperatureCelsius}
                disabled={pending}
                onChange={(event) => setDraft({ ...draft, temperatureCelsius: event.target.value })}
              />
            </Field>
            <Field label={m.vitalsGlucose()} htmlFor="vitals-glu">
              <Input
                id="vitals-glu"
                inputMode="numeric"
                value={draft.bloodGlucoseMgDl}
                disabled={pending}
                onChange={(event) => setDraft({ ...draft, bloodGlucoseMgDl: event.target.value })}
              />
            </Field>
            <Field label={m.vitalsWeight()} htmlFor="vitals-weight">
              <Input
                id="vitals-weight"
                inputMode="decimal"
                value={draft.weightKg}
                disabled={pending}
                onChange={(event) => setDraft({ ...draft, weightKg: event.target.value })}
              />
            </Field>
            <Field label={m.vitalsOxygen()} htmlFor="vitals-o2">
              <Input
                id="vitals-o2"
                inputMode="numeric"
                value={draft.oxygenSaturationPercent}
                disabled={pending}
                onChange={(event) => setDraft({ ...draft, oxygenSaturationPercent: event.target.value })}
              />
            </Field>
          </div>
          <Field label={m.vitalsNotes()} htmlFor="vitals-notes">
            <Textarea
              id="vitals-notes"
              value={draft.notes}
              disabled={pending}
              onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
            />
          </Field>
          <Button size="emergency" disabled={pending} onClick={() => void add()}>
            {m.vitalsAdd()}
          </Button>
        </div>
      ) : null}

      {error !== null ? (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      ) : null}

      {vitals.data === undefined ? (
        <p className="text-[13px] text-muted-foreground">
          {vitals.isError ? problemText(vitals.error) : m.loading()}
        </p>
      ) : vitals.data.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">{m.vitalsNone()}</p>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {vitals.data.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="text-[13px] font-medium">{formatWhen(entry.measuredAt)}</p>
                <p className="truncate text-[13px] text-muted-foreground">{summary(entry)}</p>
              </div>
              {props.canWrite ? (
                <Button variant="ghost" size="sm" disabled={pending} onClick={() => void remove(entry)}>
                  {m.vitalsRemove()}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
