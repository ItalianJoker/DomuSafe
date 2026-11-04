import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { DeadlineItem } from '@domusafe/contracts';
import { useApi } from '@/components/api-context.js';
import { Field } from '@/components/shell/page.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { problemText } from '@/lib/copy.js';
import { deadlinesQuery } from '@/lib/queries.js';
import { m } from '@/paraglide/messages.js';
import { deadlineKey, deadlineLabel } from './model.js';

/**
 * Open deadlines of the house, plus a form that stores one maintenance task.
 *
 * Preconditions: the caller may read deadlines. `canWrite` is maintenance permission.
 * Postconditions: a task marked done stays in the database and leaves the open groups.
 * Data contract: the groups come from the API, using the family time zone.
 *
 * @param props - House and whether the person may add or complete a task.
 * @returns The three groups and the form.
 */
export function DeadlinesPanel(props: {
  readonly familyId: string;
  readonly houseId: string;
  readonly canWrite: boolean;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const query = useQuery(deadlinesQuery(api, props.familyId, props.houseId));
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    await queryClient.invalidateQueries({
      queryKey: deadlinesQuery(api, props.familyId, props.houseId).queryKey,
    });
  }

  async function add(): Promise<void> {
    if (title.trim() === '' || due === '') {
      setError(m.fieldRequired());
      return;
    }
    setPending(true);
    setSaved(false);
    setError(null);
    try {
      await api.createMaintenance(
        props.familyId,
        props.houseId,
        {
          category: 'other',
          priority: 'medium',
          active: true,
          title: title.trim(),
          nextDueDate: due,
          ...(done ? { lastDoneOn: due } : {}),
        },
        crypto.randomUUID(),
      );
      setTitle('');
      setDue('');
      setDone(false);
      await refresh();
      setSaved(true);
    } catch (caught) {
      setError(problemText(caught));
    } finally {
      setPending(false);
    }
  }

  async function markDone(item: DeadlineItem): Promise<void> {
    if (item.version === null) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api.updateMaintenance(props.familyId, props.houseId, item.sourceId, item.version, {
        lastDoneOn: item.dueDate,
      });
      await refresh();
    } catch (caught) {
      setError(problemText(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="grid max-w-xl gap-6">
      <header>
        <h2 className="text-[15px] font-medium tracking-tight">{m.deadlinesTitle()}</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{m.deadlinesLead()}</p>
      </header>
      {query.isPending ? <p className="text-[13px] text-muted-foreground">{m.loading()}</p> : null}
      {query.isError ? (
        <p role="alert" className="text-[13px] text-destructive">
          {problemText(query.error)}
        </p>
      ) : null}
      {query.data === undefined ? null : (
        <div className="grid gap-5">
          <Group
            title={m.deadlinesOverdue()}
            items={query.data.overdue}
            canWrite={props.canWrite}
            pending={pending}
            onDone={(item) => void markDone(item)}
          />
          <Group
            title={m.deadlinesWeek()}
            items={query.data.week}
            canWrite={props.canWrite}
            pending={pending}
            onDone={(item) => void markDone(item)}
          />
          <Group
            title={m.deadlinesMonth()}
            items={query.data.month}
            canWrite={props.canWrite}
            pending={pending}
            onDone={(item) => void markDone(item)}
          />
        </div>
      )}
      {props.canWrite ? (
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
        >
          <h3 className="text-[13px] font-medium">{m.deadlinesAddTitle()}</h3>
          <Field htmlFor="deadline-title" label={m.deadlinesTaskTitle()}>
            <Input id="deadline-title" value={title} onChange={(event) => setTitle(event.target.value)} />
          </Field>
          <Field htmlFor="deadline-due" label={m.deadlinesDueDate()}>
            <Input
              id="deadline-due"
              type="date"
              value={due}
              onChange={(event) => setDue(event.target.value)}
            />
          </Field>
          <label className="flex items-center gap-2 text-[13px]" htmlFor="deadline-done">
            <input
              id="deadline-done"
              type="checkbox"
              className="size-4 accent-foreground"
              checked={done}
              onChange={(event) => setDone(event.target.checked)}
            />
            {m.deadlinesDone()}
          </label>
          <p className="text-[12px] text-muted-foreground">{m.deadlinesDoneHint()}</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={pending}>
              {m.save()}
            </Button>
            {error !== null ? (
              <p role="alert" className="text-[12px] text-destructive">
                {error}
              </p>
            ) : null}
            {saved && error === null ? (
              <p className="text-[12px] text-muted-foreground">{m.saved()}</p>
            ) : null}
          </div>
        </form>
      ) : null}
    </section>
  );
}

function Group(props: {
  readonly title: string;
  readonly items: readonly DeadlineItem[];
  readonly canWrite: boolean;
  readonly pending: boolean;
  readonly onDone: (item: DeadlineItem) => void;
}) {
  return (
    <section className="grid gap-2">
      <h3 className="text-[13px] font-medium">{props.title}</h3>
      {props.items.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">{m.deadlinesNone()}</p>
      ) : (
        <ul className="grid gap-2">
          {props.items.map((item) => (
            <li
              key={deadlineKey(item)}
              className="flex flex-wrap items-center justify-between gap-2 text-[13px]"
            >
              <span>
                {deadlineLabel(item)}
                <span className="text-muted-foreground"> · {item.dueDate}</span>
              </span>
              {props.canWrite && item.kind === 'maintenance' && item.version !== null ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={props.pending}
                  onClick={() => props.onDone(item)}
                >
                  {m.deadlinesMarkDone()}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
