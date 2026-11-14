import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { RelationshipEntry, RelationshipReminderState } from '@domusafe/contracts';
import { useApi } from '@/components/api-context.js';
import { Field } from '@/components/shell/page.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Textarea } from '@/components/ui/textarea.js';
import { problemText } from '@/lib/copy.js';
import { relationshipsQuery } from '@/lib/queries.js';
import { m } from '@/paraglide/messages.js';

function reminderLabel(state: RelationshipReminderState, nextReminderOn: string | null): string {
  switch (state) {
    case 'none':
      return m.personaleCrmReminderNone();
    case 'upcoming':
      return m.personaleCrmReminderUpcoming({ date: nextReminderOn ?? '' });
    case 'due':
      return m.personaleCrmReminderDue();
    case 'overdue':
      return m.personaleCrmReminderOverdue({ date: nextReminderOn ?? '' });
  }
}

function todayLocal(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value ?? '1970';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  const day = parts.find((part) => part.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

/**
 * Ethical personal contact notebook: names, notes and simple contact reminders.
 *
 * Preconditions: the caller holds `care.relationships`.
 * Postconditions: only the caller's own entries are listed; no scores or tracking.
 * Data contract: edits are manual and persisted by `POST`/`PATCH`/`DELETE …/relationships`.
 *
 * @param props - Family and whether the person may edit.
 * @returns The notebook tab.
 */
export function RelationshipsPanel(props: { readonly familyId: string; readonly canWrite: boolean }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const entries = useQuery(relationshipsQuery(api, props.familyId));
  const [displayName, setDisplayName] = useState('');
  const [relation, setRelation] = useState('');
  const [lastContactOn, setLastContactOn] = useState('');
  const [intervalDays, setIntervalDays] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    await queryClient.invalidateQueries({
      queryKey: relationshipsQuery(api, props.familyId).queryKey,
    });
  }

  async function add(): Promise<void> {
    if (displayName.trim() === '') {
      setError(m.fieldRequired());
      return;
    }
    const interval = intervalDays.trim() === '' ? null : Number.parseInt(intervalDays.trim(), 10);
    if (interval !== null && (!Number.isInteger(interval) || interval < 1 || interval > 3660)) {
      setError(m.personaleCrmIntervalInvalid());
      return;
    }
    setError(null);
    try {
      await api.createRelationship(props.familyId, crypto.randomUUID(), {
        displayName: displayName.trim(),
        relation: relation.trim() === '' ? null : relation.trim(),
        lastContactOn: lastContactOn.trim() === '' ? null : lastContactOn.trim(),
        contactIntervalDays: interval,
        notes: notes.trim() === '' ? null : notes.trim(),
      });
      setDisplayName('');
      setRelation('');
      setLastContactOn('');
      setIntervalDays('');
      setNotes('');
      await refresh();
    } catch (caught) {
      setError(problemText(caught));
    }
  }

  async function markContacted(entry: RelationshipEntry): Promise<void> {
    setBusyId(entry.id);
    setError(null);
    try {
      await api.updateRelationship(props.familyId, entry.id, entry.version, {
        lastContactOn: todayLocal(),
      });
      await refresh();
    } catch (caught) {
      setError(problemText(caught));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(entry: RelationshipEntry): Promise<void> {
    setBusyId(entry.id);
    setError(null);
    try {
      await api.deleteRelationship(props.familyId, entry.id, entry.version);
      await refresh();
    } catch (caught) {
      setError(problemText(caught));
    } finally {
      setBusyId(null);
    }
  }

  const items = entries.data ?? [];

  return (
    <div className="grid max-w-xl gap-6">
      <p className="text-[13px] text-muted-foreground">{m.personaleCrmLead()}</p>
      {items.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">{m.personaleCrmEmpty()}</p>
      ) : (
        <ul className="grid gap-4">
          {items.map((entry) => (
            <li key={entry.id} className="grid gap-2 border-b border-border pb-4 text-[13px]">
              <p className="font-medium">
                {entry.displayName}
                {entry.relation === null ? '' : ` · ${entry.relation}`}
              </p>
              <p className="text-muted-foreground">
                {entry.lastContactOn === null
                  ? m.personaleCrmLastNone()
                  : m.personaleCrmLastOn({ date: entry.lastContactOn })}
              </p>
              <p className="text-muted-foreground">
                {reminderLabel(entry.reminderState, entry.nextReminderOn)}
              </p>
              {entry.notes === null || entry.notes.trim() === '' ? null : (
                <p className="whitespace-pre-wrap">{entry.notes}</p>
              )}
              {props.canWrite ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    type="button"
                    size="emergency"
                    disabled={busyId === entry.id}
                    onClick={() => {
                      void markContacted(entry);
                    }}
                  >
                    {m.personaleCrmMarkToday()}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="emergency"
                    disabled={busyId === entry.id}
                    onClick={() => {
                      void remove(entry);
                    }}
                  >
                    {m.personaleRemove()}
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {props.canWrite ? (
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
        >
          <Field label={m.personaleCrmName()} htmlFor="crm-name">
            <Input
              id="crm-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </Field>
          <Field label={m.personaleRelation()} htmlFor="crm-relation">
            <Input id="crm-relation" value={relation} onChange={(event) => setRelation(event.target.value)} />
          </Field>
          <Field label={m.personaleCrmLastContact()} htmlFor="crm-last">
            <Input
              id="crm-last"
              type="date"
              value={lastContactOn}
              onChange={(event) => setLastContactOn(event.target.value)}
            />
          </Field>
          <Field label={m.personaleCrmInterval()} htmlFor="crm-interval" hint={m.personaleCrmIntervalHint()}>
            <Input
              id="crm-interval"
              inputMode="numeric"
              value={intervalDays}
              onChange={(event) => setIntervalDays(event.target.value)}
            />
          </Field>
          <Field label={m.personaleNotes()} htmlFor="crm-notes">
            <Textarea
              id="crm-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={4}
            />
          </Field>
          {error === null ? null : <p className="text-[13px] text-destructive">{error}</p>}
          <Button type="submit" size="emergency">
            {m.personaleCrmAdd()}
          </Button>
        </form>
      ) : (
        <p className="text-[13px] text-muted-foreground">{m.personaleReadOnly()}</p>
      )}
    </div>
  );
}
