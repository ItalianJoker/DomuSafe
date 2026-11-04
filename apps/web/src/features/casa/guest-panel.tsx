import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type SubmitEvent } from 'react';
import type { GuideEntry, WasteCollection } from '@domusafe/contracts';
import { WASTE_FRACTIONS } from '@domusafe/contracts';
import { useApi } from '@/components/api-context.js';
import { Field } from '@/components/shell/page.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Textarea } from '@/components/ui/textarea.js';
import { problemText } from '@/lib/copy.js';
import { guestPreviewQuery, guestViewQuery } from '@/lib/queries.js';
import { m } from '@/paraglide/messages.js';
import {
  GUEST_TOPICS,
  WEEKDAYS,
  rruleToWeekdays,
  uuidv7,
  weekdaysToRrule,
  type GuestTopic,
} from './model.js';

const SELECT = 'h-8 w-full rounded-md border border-input bg-transparent px-2 text-[13px]';

function topicLabel(topic: GuestTopic): string {
  switch (topic) {
    case 'wifi':
      return m.casaWifi();
    case 'intercom':
      return m.casaIntercom();
    case 'parcels':
      return m.casaParcels();
    case 'pets':
      return m.casaPets();
    case 'plants':
      return m.casaPlants();
  }
}

function fractionLabel(fraction: (typeof WASTE_FRACTIONS)[number]): string {
  switch (fraction) {
    case 'organic':
      return m.casaFractionOrganic();
    case 'paper':
      return m.casaFractionPaper();
    case 'plastic':
      return m.casaFractionPlastic();
    case 'glass':
      return m.casaFractionGlass();
    case 'metal':
      return m.casaFractionMetal();
    case 'residual':
      return m.casaFractionResidual();
    case 'bulky':
      return m.casaFractionBulky();
    case 'green':
      return m.casaFractionGreen();
    case 'other':
      return m.casaFractionOther();
  }
}

function dayLabel(day: (typeof WEEKDAYS)[number]): string {
  switch (day) {
    case 'MO':
      return m.casaDayMonday();
    case 'TU':
      return m.casaDayTuesday();
    case 'WE':
      return m.casaDayWednesday();
    case 'TH':
      return m.casaDayThursday();
    case 'FR':
      return m.casaDayFriday();
    case 'SA':
      return m.casaDaySaturday();
    case 'SU':
      return m.casaDaySunday();
  }
}

function Status(props: { readonly saved: boolean; readonly error: string | null }) {
  if (props.error !== null) {
    return (
      <p role="alert" className="text-[12px] text-destructive">
        {props.error}
      </p>
    );
  }
  if (props.saved) {
    return <p className="text-[12px] text-muted-foreground">{m.saved()}</p>;
  }
  return null;
}

/**
 * Guest manual and waste calendar for the open house.
 *
 * Preconditions: the caller can read the guest view.
 * Postconditions: saves send the loaded version in `If-Match`.
 * Data contract: the text is what a guest reads. Secrets are not given a separate plaintext field.
 *
 * @param props - House and whether the person may edit or preview.
 * @returns The guest section.
 */
export function GuestPanel(props: {
  readonly familyId: string;
  readonly houseId: string;
  readonly canWrite: boolean;
  readonly canPreview: boolean;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [preview, setPreview] = useState(false);
  const live = useQuery({ ...guestViewQuery(api, props.familyId, props.houseId), enabled: !preview });
  const shown = useQuery({
    ...guestPreviewQuery(api, props.familyId, props.houseId),
    enabled: preview && props.canPreview,
  });
  const query = preview ? shown : live;
  const readOnly = preview || !props.canWrite;

  async function refresh(): Promise<void> {
    await queryClient.invalidateQueries({
      queryKey: guestViewQuery(api, props.familyId, props.houseId).queryKey,
    });
    await queryClient.invalidateQueries({
      queryKey: guestPreviewQuery(api, props.familyId, props.houseId).queryKey,
    });
  }

  return (
    <div className="grid max-w-xl gap-8">
      {props.canPreview ? (
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => setPreview((value) => !value)}>
            {preview ? m.casaEditing() : m.casaPreview()}
          </Button>
          {preview ? <p className="text-[13px] text-muted-foreground">{m.casaPreviewLead()}</p> : null}
        </div>
      ) : null}
      {readOnly && !preview ? <p className="text-[13px] text-muted-foreground">{m.casaReadOnly()}</p> : null}
      {!readOnly ? <p className="text-[13px] text-muted-foreground">{m.casaGuestHint()}</p> : null}
      {query.isPending ? <p className="text-[13px] text-muted-foreground">{m.loading()}</p> : null}
      {query.isError ? (
        <p role="alert" className="text-[13px] text-destructive">
          {problemText(query.error)}
        </p>
      ) : null}
      {query.data === undefined
        ? null
        : GUEST_TOPICS.map((topic) => (
            <TopicCard
              key={topic}
              topic={topic}
              entry={query.data.entries.find((item) => item.topic === topic)}
              readOnly={readOnly}
              onSave={async (title, body) => {
                const entry = query.data.entries.find((item) => item.topic === topic);
                const storedTitle = title.trim() === '' ? topicLabel(topic) : title.trim();
                if (entry === undefined) {
                  await api.createGuideEntry(
                    props.familyId,
                    props.houseId,
                    {
                      id: uuidv7(),
                      audience: 'guest',
                      topic,
                      title: storedTitle,
                      body: body.trim(),
                      sortOrder: GUEST_TOPICS.indexOf(topic),
                    },
                    crypto.randomUUID(),
                  );
                } else {
                  await api.updateGuideEntry(props.familyId, props.houseId, entry.id, entry.version, {
                    title: storedTitle,
                    body: body.trim(),
                  });
                }
                await refresh();
              }}
            />
          ))}
      {query.data === undefined ? null : (
        <WasteCard
          rows={query.data.wasteCollections}
          readOnly={readOnly}
          onCreate={async (input) => {
            await api.createWaste(props.familyId, props.houseId, input, crypto.randomUUID());
            await refresh();
          }}
          onDelete={async (row) => {
            await api.deleteWaste(props.familyId, props.houseId, row.id, row.version);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

function TopicCard(props: {
  readonly topic: GuestTopic;
  readonly entry: GuideEntry | undefined;
  readonly readOnly: boolean;
  readonly onSave: (title: string, body: string) => Promise<void>;
}) {
  const [title, setTitle] = useState(props.entry?.title ?? '');
  const [body, setBody] = useState(props.entry?.body ?? '');
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setTitle(props.entry?.title ?? '');
    setBody(props.entry?.body ?? '');
  }, [props.entry?.id, props.entry?.version, props.entry?.title, props.entry?.body]);

  async function submit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPending(true);
    setSaved(false);
    setError(null);
    try {
      await props.onSave(title, body);
      setSaved(true);
    } catch (caught) {
      setError(problemText(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <section>
      <h2 className="mb-3 text-[13px] font-medium">{topicLabel(props.topic)}</h2>
      {props.readOnly ? (
        props.entry === undefined || (props.entry.title === '' && props.entry.body === '') ? (
          <p className="text-[13px] text-muted-foreground">{m.casaEmpty()}</p>
        ) : (
          <div className="grid gap-1 text-[13px]">
            <p>{props.entry.title}</p>
            {props.entry.body === '' ? null : (
              <p className="whitespace-pre-wrap text-muted-foreground">{props.entry.body}</p>
            )}
          </div>
        )
      ) : (
        <form className="grid gap-3" onSubmit={(event) => void submit(event)}>
          <Field
            htmlFor={`guest-${props.topic}-title`}
            label={props.topic === 'wifi' ? m.casaWifiName() : m.casaTitleField()}
          >
            <Input
              id={`guest-${props.topic}-title`}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>
          <Field htmlFor={`guest-${props.topic}-body`} label={m.casaInstructions()}>
            <Textarea
              id={`guest-${props.topic}-body`}
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
          </Field>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={pending}>
              {m.save()}
            </Button>
            <Status saved={saved} error={error} />
          </div>
        </form>
      )}
    </section>
  );
}

function WasteCard(props: {
  readonly rows: readonly WasteCollection[];
  readonly readOnly: boolean;
  readonly onCreate: (input: {
    fraction: WasteCollection['fraction'];
    rrule: string | null;
    collectionTime: string | null;
    instructions: string | null;
  }) => Promise<void>;
  readonly onDelete: (row: WasteCollection) => Promise<void>;
}) {
  const [fraction, setFraction] = useState<WasteCollection['fraction']>('organic');
  const [days, setDays] = useState<string[]>([]);
  const [time, setTime] = useState('');
  const [instructions, setInstructions] = useState('');
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(day: string): void {
    setDays((current) =>
      current.includes(day) ? current.filter((item) => item !== day) : [...current, day],
    );
  }

  async function submit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPending(true);
    setSaved(false);
    setError(null);
    try {
      await props.onCreate({
        fraction,
        rrule: weekdaysToRrule(days),
        collectionTime: time === '' ? null : time,
        instructions: instructions.trim() === '' ? null : instructions.trim(),
      });
      setDays([]);
      setTime('');
      setInstructions('');
      setSaved(true);
    } catch (caught) {
      setError(problemText(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <section>
      <h2 className="mb-3 text-[13px] font-medium">{m.casaWaste()}</h2>
      {props.rows.length === 0 ? (
        <p className="mb-3 text-[13px] text-muted-foreground">{m.casaEmpty()}</p>
      ) : null}
      <ul className="mb-4 divide-y divide-border border-y border-border">
        {props.rows.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-3 py-2">
            <span className="text-[13px]">
              {fractionLabel(row.fraction)}
              {row.collectionTime === null ? '' : ` · ${row.collectionTime}`}
              {rruleToWeekdays(row.rrule).length === 0
                ? ''
                : ` · ${rruleToWeekdays(row.rrule)
                    .map((day) => dayLabel(day as (typeof WEEKDAYS)[number]))
                    .join(', ')}`}
            </span>
            {props.readOnly ? null : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  void props.onDelete(row).catch((caught: unknown) => setError(problemText(caught)));
                }}
              >
                {m.casaDelete()}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {props.readOnly ? null : (
        <form className="grid gap-3" onSubmit={(event) => void submit(event)}>
          <Field htmlFor="waste-fraction" label={m.casaFraction()}>
            <select
              id="waste-fraction"
              className={SELECT}
              value={fraction}
              onChange={(event) => setFraction(event.target.value as WasteCollection['fraction'])}
            >
              {WASTE_FRACTIONS.map((item) => (
                <option key={item} value={item}>
                  {fractionLabel(item)}
                </option>
              ))}
            </select>
          </Field>
          <fieldset className="grid gap-1">
            <legend className="text-[13px]">{m.casaDays()}</legend>
            <div className="flex flex-wrap gap-x-3">
              {WEEKDAYS.map((day) => (
                <label key={day} className="flex h-8 items-center gap-2 text-[13px]">
                  <input type="checkbox" checked={days.includes(day)} onChange={() => toggle(day)} />
                  {dayLabel(day)}
                </label>
              ))}
            </div>
          </fieldset>
          <Field htmlFor="waste-time" label={m.casaTime()}>
            <Input
              id="waste-time"
              type="time"
              value={time}
              onChange={(event) => setTime(event.target.value)}
            />
          </Field>
          <Field htmlFor="waste-notes" label={m.casaInstructions()}>
            <Textarea
              id="waste-notes"
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
            />
          </Field>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={pending}>
              {m.casaAddWaste()}
            </Button>
            <Status saved={saved} error={error} />
          </div>
        </form>
      )}
    </section>
  );
}
