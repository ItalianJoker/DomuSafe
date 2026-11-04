import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { can, type Me, type SuccessionItem, type UpdateSuccessionItemRequest } from '@domusafe/contracts';
import { hasFeature, type PlanTier } from '@domusafe/plans';
import { useApi } from '@/components/api-context.js';
import { Field, PageHeader } from '@/components/shell/page.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Textarea } from '@/components/ui/textarea.js';
import { problemText } from '@/lib/copy.js';
import { successionQuery } from '@/lib/queries.js';
import { m } from '@/paraglide/messages.js';
import { getLocale } from '@/paraglide/runtime.js';
import { hasLongDigitRun, inheritanceKitLines, standardsMissing, successionTitle } from './model.js';

/**
 * Family succession checklist, loaded on its own so the shell stays small.
 *
 * Preconditions: `familyId` is one of the account's families.
 * Postconditions: Advanced and below see the locked explanation. Premium and the trial can edit and print.
 * Data contract: the printed kit is the checklist. Vault documents are not requested.
 *
 * @param props - Account and the open family.
 * @returns The screen.
 */
export function SuccessionPage(props: {
  readonly me: Me;
  readonly familyId: string;
  readonly houseId: string;
}) {
  const family = props.me.families.find((item) => item.id === props.familyId);
  const plan: PlanTier = family?.plan ?? 'free';
  const role = family?.role;
  const subject =
    role === undefined ? null : { role, isOwner: false, vaultFamilyConcession: family?.vaultFamily ?? false };
  const allowed = subject !== null && can(subject, 'vault.family.read');
  const canWrite = subject !== null && can(subject, 'vault.family.write');
  const familyName = family?.name ?? '';

  useEffect(() => {
    const clear = () => {
      delete document.documentElement.dataset.printSheet;
    };
    window.addEventListener('afterprint', clear);
    return () => {
      window.removeEventListener('afterprint', clear);
    };
  }, []);

  if (!hasFeature(plan, 'succession')) {
    return (
      <section>
        <PageHeader title={m.successionTitle()} lead={m.successionLead()} />
        <p className="max-w-xl text-[13px] leading-relaxed text-muted-foreground">{m.successionLocked()}</p>
        <BackLink familyId={props.familyId} houseId={props.houseId} />
      </section>
    );
  }
  if (!allowed) {
    return (
      <section>
        <PageHeader title={m.successionTitle()} lead={m.successionLead()} />
        <p className="max-w-xl text-[13px] leading-relaxed text-muted-foreground">{m.successionHidden()}</p>
        <BackLink familyId={props.familyId} houseId={props.houseId} />
      </section>
    );
  }

  return (
    <Editor familyId={props.familyId} houseId={props.houseId} familyName={familyName} canWrite={canWrite} />
  );
}

function Editor(props: {
  readonly familyId: string;
  readonly houseId: string;
  readonly familyName: string;
  readonly canWrite: boolean;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const checklist = useQuery(successionQuery(api, props.familyId));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const items = checklist.data?.items ?? [];
  const lines = inheritanceKitLines(items);

  async function refresh(): Promise<void> {
    await queryClient.invalidateQueries({ queryKey: successionQuery(api, props.familyId).queryKey });
  }

  async function prepare(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await api.prepareSuccession(props.familyId, crypto.randomUUID());
      await refresh();
    } catch (caught) {
      setError(problemText(caught));
    } finally {
      setBusy(false);
    }
  }

  async function save(item: SuccessionItem, patch: UpdateSuccessionItemRequest): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await api.updateSuccessionItem(props.familyId, item.id, item.version, patch);
      await refresh();
    } catch (caught) {
      setError(problemText(caught));
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: SuccessionItem): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await api.deleteSuccessionItem(props.familyId, item.id, item.version);
      await refresh();
    } catch (caught) {
      setError(problemText(caught));
    } finally {
      setBusy(false);
    }
  }

  async function add(body: { title: string; notes?: string; deadlineNote?: string }): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await api.createSuccessionItem(props.familyId, body, crypto.randomUUID());
      await refresh();
      return true;
    } catch (caught) {
      setError(problemText(caught));
      return false;
    } finally {
      setBusy(false);
    }
  }

  function printKit(): void {
    document.documentElement.dataset.printSheet = 'kit';
    window.print();
  }

  if (checklist.isPending) {
    return <p className="text-[13px] text-muted-foreground">{m.loading()}</p>;
  }
  if (checklist.isError) {
    return (
      <p role="alert" className="text-[13px] text-destructive">
        {problemText(checklist.error)}
      </p>
    );
  }

  return (
    <section className="grid gap-6">
      <div className="print:hidden">
        <PageHeader title={m.successionTitle()} lead={m.successionLead()} />
        <p className="mb-4 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
          {m.successionNotesHelp()}
        </p>
        <div className="flex flex-wrap gap-3">
          {props.canWrite && standardsMissing(items) ? (
            <Button type="button" disabled={busy} onClick={() => void prepare()}>
              {m.successionPrepare()}
            </Button>
          ) : null}
          <Button type="button" variant="outline" disabled={busy} onClick={printKit}>
            {m.successionExport()}
          </Button>
        </div>
        {items.length === 0 ? (
          <p className="mt-4 text-[13px] text-muted-foreground">{m.successionEmpty()}</p>
        ) : (
          <ul className="mt-6 grid max-w-xl gap-6">
            {items.map((item) => (
              <ActivityForm
                key={`${item.id}:${String(item.version)}`}
                item={item}
                canWrite={props.canWrite}
                busy={busy}
                onSave={(patch) => save(item, patch)}
                onRemove={() => remove(item)}
              />
            ))}
          </ul>
        )}
        {props.canWrite ? <AddForm busy={busy} onAdd={add} /> : null}
        {error === null ? null : (
          <p role="alert" className="mt-3 text-[13px] text-destructive">
            {error}
          </p>
        )}
        <BackLink familyId={props.familyId} houseId={props.houseId} />
      </div>
      <KitSheet familyName={props.familyName} lines={lines} />
    </section>
  );
}

function ActivityForm(props: {
  readonly item: SuccessionItem;
  readonly canWrite: boolean;
  readonly busy: boolean;
  readonly onSave: (patch: UpdateSuccessionItemRequest) => Promise<void>;
  readonly onRemove: () => Promise<void>;
}) {
  const [title, setTitle] = useState(props.item.title ?? '');
  const [notes, setNotes] = useState(props.item.notes ?? '');
  const [deadline, setDeadline] = useState(props.item.deadlineNote ?? '');
  const [localError, setLocalError] = useState<string | null>(null);
  const label = successionTitle(props.item);

  function patch(done: boolean): UpdateSuccessionItemRequest | null {
    if ([title, notes, deadline].some((value) => hasLongDigitRun(value))) {
      setLocalError(m.successionSecret());
      return null;
    }
    const nextTitle = title.trim();
    if (props.item.kind === 'custom' && nextTitle === '') {
      setLocalError(m.fieldRequired());
      return null;
    }
    setLocalError(null);
    return {
      title: nextTitle === '' ? null : nextTitle,
      notes: notes.trim() === '' ? null : notes.trim(),
      deadlineNote: deadline.trim() === '' ? null : deadline.trim(),
      done,
    };
  }

  return (
    <li className="grid gap-3 border-t border-border pt-4">
      <label className="flex min-h-8 items-center gap-3 text-[13px]">
        <input
          type="checkbox"
          className="size-4"
          checked={props.item.done}
          disabled={!props.canWrite || props.busy}
          onChange={(event) => {
            const next = patch(event.target.checked);
            if (next !== null) {
              void props.onSave(next);
            }
          }}
        />
        <span className={props.item.done ? 'text-muted-foreground' : 'font-medium'}>
          {props.item.done ? m.successionDone() : m.successionOpen()}: {label}
        </span>
      </label>
      <Field label={m.successionTitleField()} htmlFor={`succession-title-${props.item.id}`}>
        <Input
          id={`succession-title-${props.item.id}`}
          value={title}
          placeholder={label}
          disabled={!props.canWrite}
          onChange={(event) => setTitle(event.target.value)}
        />
      </Field>
      <Field label={m.successionNotes()} htmlFor={`succession-notes-${props.item.id}`}>
        <Textarea
          id={`succession-notes-${props.item.id}`}
          value={notes}
          disabled={!props.canWrite}
          onChange={(event) => setNotes(event.target.value)}
        />
      </Field>
      <Field label={m.successionDeadline()} htmlFor={`succession-deadline-${props.item.id}`}>
        <Input
          id={`succession-deadline-${props.item.id}`}
          value={deadline}
          placeholder={m.successionDeadlineHint()}
          disabled={!props.canWrite}
          onChange={(event) => setDeadline(event.target.value)}
        />
      </Field>
      {props.canWrite ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={props.busy}
            onClick={() => {
              const next = patch(props.item.done);
              if (next !== null) {
                void props.onSave(next);
              }
            }}
          >
            {m.successionSave()}
          </Button>
          <Button type="button" variant="outline" disabled={props.busy} onClick={() => void props.onRemove()}>
            {m.successionRemove()}
          </Button>
        </div>
      ) : null}
      {localError === null ? null : (
        <p role="alert" className="text-[13px] text-destructive">
          {localError}
        </p>
      )}
    </li>
  );
}

function AddForm(props: {
  readonly busy: boolean;
  readonly onAdd: (body: { title: string; notes?: string; deadlineNote?: string }) => Promise<boolean>;
}) {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [deadline, setDeadline] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    if (title.trim() === '') {
      setLocalError(m.fieldRequired());
      return;
    }
    if ([title, notes, deadline].some((value) => hasLongDigitRun(value))) {
      setLocalError(m.successionSecret());
      return;
    }
    setLocalError(null);
    const saved = await props.onAdd({
      title: title.trim(),
      ...(notes.trim() === '' ? {} : { notes: notes.trim() }),
      ...(deadline.trim() === '' ? {} : { deadlineNote: deadline.trim() }),
    });
    if (!saved) {
      return;
    }
    setTitle('');
    setNotes('');
    setDeadline('');
  }

  return (
    <div className="mt-6 grid max-w-xl gap-3 border-t border-border pt-4">
      <h2 className="text-[13px] font-medium">{m.successionAdd()}</h2>
      <Field label={m.successionTitleField()} htmlFor="succession-new-title">
        <Input id="succession-new-title" value={title} onChange={(event) => setTitle(event.target.value)} />
      </Field>
      <Field label={m.successionNotes()} htmlFor="succession-new-notes">
        <Textarea
          id="succession-new-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </Field>
      <Field label={m.successionDeadline()} htmlFor="succession-new-deadline">
        <Input
          id="succession-new-deadline"
          value={deadline}
          placeholder={m.successionDeadlineHint()}
          onChange={(event) => setDeadline(event.target.value)}
        />
      </Field>
      <Button type="button" disabled={props.busy} onClick={() => void submit()}>
        {m.successionAdd()}
      </Button>
      {localError === null ? null : (
        <p role="alert" className="text-[13px] text-destructive">
          {localError}
        </p>
      )}
    </div>
  );
}

function KitSheet(props: {
  readonly familyName: string;
  readonly lines: ReturnType<typeof inheritanceKitLines>;
}) {
  const today = new Intl.DateTimeFormat(getLocale() === 'en' ? 'en' : 'it', { dateStyle: 'long' }).format(
    new Date(),
  );
  return (
    <article className="print-sheet sheet-kit hidden print:block">
      <h1 className="text-lg font-medium">{m.successionKitTitle()}</h1>
      <p className="mt-1 text-[13px]">
        {props.familyName} · {today}
      </p>
      <p className="mt-3 text-[13px] leading-relaxed">{m.successionKitNote()}</p>
      {props.lines.length === 0 ? (
        <p className="mt-4 text-[13px]">{m.successionEmpty()}</p>
      ) : (
        <ol className="mt-4 grid gap-3">
          {props.lines.map((line, index) => (
            <li key={`${String(index)}:${line.title}`} className="text-[13px] leading-relaxed">
              <p className="font-medium">
                {line.done ? m.successionDone() : m.successionOpen()} — {line.title}
              </p>
              {line.deadlineNote === null ? null : <p>{line.deadlineNote}</p>}
              {line.notes === null ? null : <p>{line.notes}</p>}
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}

function BackLink(props: { readonly familyId: string; readonly houseId: string }) {
  return (
    <p className="mt-6 print:hidden">
      <Link
        to="/f/$familyId/c/$houseId/famiglia"
        params={{ familyId: props.familyId, houseId: props.houseId }}
        className="text-[13px] text-muted-foreground underline-offset-4 hover:underline"
      >
        {m.successionBack()}
      </Link>
    </p>
  );
}
