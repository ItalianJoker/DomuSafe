import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { MaintenanceTask } from '@domusafe/contracts';
import { useApi } from '@/components/api-context.js';
import { Field } from '@/components/shell/page.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Textarea } from '@/components/ui/textarea.js';
import { problemText } from '@/lib/copy.js';
import { boilerQuery } from '@/lib/queries.js';
import { m } from '@/paraglide/messages.js';
import { localDate } from './model.js';

function earliest(tasks: readonly MaintenanceTask[]): MaintenanceTask | undefined {
  return [...tasks].sort((left, right) => {
    const a = left.nextDueDate ?? '9999-12-31';
    const b = right.nextDueDate ?? '9999-12-31';
    return a.localeCompare(b);
  })[0];
}

/**
 * Boiler-check deadline for the open house.
 *
 * Preconditions: the caller can read maintenance tasks.
 * Postconditions: marking it done stores today's local date as the last completion.
 * Data contract: the task category is heating.
 *
 * @param props - House and whether the person may edit.
 * @returns The deadline section.
 */
export function DeadlinePanel(props: {
  readonly familyId: string;
  readonly houseId: string;
  readonly canWrite: boolean;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const query = useQuery(boilerQuery(api, props.familyId, props.houseId));
  const task = query.data === undefined ? undefined : earliest(query.data);
  const [title, setTitle] = useState(task?.title ?? '');
  const [due, setDue] = useState(task?.nextDueDate ?? '');
  const [notes, setNotes] = useState(task?.description ?? '');
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(task?.title ?? m.casaBoilerCheck());
    setDue(task?.nextDueDate ?? '');
    setNotes(task?.description ?? '');
  }, [task?.id, task?.version, task?.title, task?.nextDueDate, task?.description]);

  async function refresh(): Promise<void> {
    await queryClient.invalidateQueries({
      queryKey: boilerQuery(api, props.familyId, props.houseId).queryKey,
    });
  }

  async function save(lastDoneOn?: string): Promise<void> {
    if (title.trim() === '') {
      setError(m.fieldRequired());
      return;
    }
    setPending(true);
    setSaved(false);
    setError(null);
    try {
      const description = notes.trim() === '' ? null : notes.trim();
      const nextDueDate = due === '' ? null : due;
      if (task === undefined) {
        await api.createMaintenance(
          props.familyId,
          props.houseId,
          {
            category: 'heating',
            priority: 'medium',
            active: true,
            title: title.trim(),
            description,
            nextDueDate,
            ...(lastDoneOn === undefined ? {} : { lastDoneOn }),
          },
          crypto.randomUUID(),
        );
      } else {
        await api.updateMaintenance(props.familyId, props.houseId, task.id, task.version, {
          title: title.trim(),
          description,
          nextDueDate,
          ...(lastDoneOn === undefined ? {} : { lastDoneOn }),
        });
      }
      await refresh();
      setSaved(true);
    } catch (caught) {
      setError(problemText(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="grid max-w-xl gap-3">
      <h2 className="text-[13px] font-medium">{m.casaBoilerCheck()}</h2>
      {!props.canWrite ? <p className="text-[13px] text-muted-foreground">{m.casaReadOnly()}</p> : null}
      {query.isPending ? <p className="text-[13px] text-muted-foreground">{m.loading()}</p> : null}
      {query.isError ? (
        <p role="alert" className="text-[13px] text-destructive">
          {problemText(query.error)}
        </p>
      ) : null}
      {query.data === undefined ? null : props.canWrite ? (
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <Field htmlFor="boiler-title" label={m.casaTitleField()}>
            <Input id="boiler-title" value={title} onChange={(event) => setTitle(event.target.value)} />
          </Field>
          <Field htmlFor="boiler-due" label={m.casaDueDate()}>
            <Input id="boiler-due" type="date" value={due} onChange={(event) => setDue(event.target.value)} />
          </Field>
          <Field htmlFor="boiler-notes" label={m.casaNotes()}>
            <Textarea id="boiler-notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
          </Field>
          {task?.lastDoneOn === null || task?.lastDoneOn === undefined ? null : (
            <p className="text-[13px] text-muted-foreground">
              {m.casaMarkDone()}: {task.lastDoneOn}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={pending}>
              {m.save()}
            </Button>
            <Button type="button" variant="outline" disabled={pending} onClick={() => void save(localDate())}>
              {m.casaMarkDone()}
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
      ) : task === undefined ? (
        <p className="text-[13px] text-muted-foreground">{m.casaEmpty()}</p>
      ) : (
        <p className="text-[13px]">
          {task.title}
          {task.nextDueDate === null ? '' : ` · ${task.nextDueDate}`}
        </p>
      )}
    </section>
  );
}
