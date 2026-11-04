import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type SubmitEvent } from 'react';
import type { Contact, Shutoff } from '@domusafe/contracts';
import { useApi } from '@/components/api-context.js';
import { Field } from '@/components/shell/page.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Textarea } from '@/components/ui/textarea.js';
import { problemText } from '@/lib/copy.js';
import { artisansQuery, shutoffsQuery } from '@/lib/queries.js';
import { m } from '@/paraglide/messages.js';
import { SHUTOFF_KINDS, telHref, type ShownShutoff } from './model.js';

function shutoffLabel(kind: ShownShutoff): string {
  switch (kind) {
    case 'water':
      return m.casaShutoffWater();
    case 'gas':
      return m.casaShutoffGas();
    case 'electricity':
      return m.casaShutoffPower();
    case 'boiler':
      return m.casaShutoffBoiler();
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
 * Technical view: cutoff locations and tradespeople for the open house.
 *
 * Preconditions: the caller can read the technical view.
 * Postconditions: the cutoff controls are at least 48 pixels tall.
 * Data contract: a phone link is offered only for an international number.
 *
 * @param props - House and whether the person may edit.
 * @returns The technical section.
 */
export function TechnicalPanel(props: {
  readonly familyId: string;
  readonly houseId: string;
  readonly canWrite: boolean;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const shutoffs = useQuery(shutoffsQuery(api, props.familyId, props.houseId));
  const artisans = useQuery(artisansQuery(api, props.familyId, props.houseId));
  const [kind, setKind] = useState<ShownShutoff>('water');
  const current = shutoffs.data?.find((row) => row.kind === kind);

  async function refreshShutoffs(): Promise<void> {
    await queryClient.invalidateQueries({
      queryKey: shutoffsQuery(api, props.familyId, props.houseId).queryKey,
    });
  }
  async function refreshArtisans(): Promise<void> {
    await queryClient.invalidateQueries({
      queryKey: artisansQuery(api, props.familyId, props.houseId).queryKey,
    });
  }

  return (
    <div className="grid max-w-xl gap-8">
      {!props.canWrite ? <p className="text-[13px] text-muted-foreground">{m.casaReadOnly()}</p> : null}
      <div className="flex flex-wrap gap-2">
        {SHUTOFF_KINDS.map((item) => (
          <Button
            key={item}
            size="emergency"
            variant={item === kind ? 'default' : 'outline'}
            onClick={() => setKind(item)}
          >
            {shutoffLabel(item)}
          </Button>
        ))}
      </div>
      {shutoffs.isPending ? <p className="text-[13px] text-muted-foreground">{m.loading()}</p> : null}
      {shutoffs.isError ? (
        <p role="alert" className="text-[13px] text-destructive">
          {problemText(shutoffs.error)}
        </p>
      ) : null}
      {shutoffs.data === undefined ? null : (
        <ShutoffForm
          kind={kind}
          row={current}
          readOnly={!props.canWrite}
          onSave={async (location, instructions, visibleToGuests) => {
            if (current === undefined) {
              await api.createShutoff(
                props.familyId,
                props.houseId,
                { kind, location, instructions, visibleToGuests },
                crypto.randomUUID(),
              );
            } else {
              await api.updateShutoff(props.familyId, props.houseId, current.id, current.version, {
                location,
                instructions,
                visibleToGuests,
              });
            }
            await refreshShutoffs();
          }}
        />
      )}
      <Artisans
        rows={artisans.data ?? []}
        pending={artisans.isPending}
        error={artisans.isError ? problemText(artisans.error) : null}
        readOnly={!props.canWrite}
        onCreate={async (input) => {
          await api.createContact(
            props.familyId,
            {
              kind: 'craftsman',
              visibility: 'family',
              visibleToGuests: false,
              houseId: props.houseId,
              ...input,
            },
            crypto.randomUUID(),
          );
          await refreshArtisans();
        }}
      />
    </div>
  );
}

function ShutoffForm(props: {
  readonly kind: ShownShutoff;
  readonly row: Shutoff | undefined;
  readonly readOnly: boolean;
  readonly onSave: (location: string, instructions: string, visibleToGuests: boolean) => Promise<void>;
}) {
  const [location, setLocation] = useState(props.row?.location ?? '');
  const [instructions, setInstructions] = useState(props.row?.instructions ?? '');
  const [visible, setVisible] = useState(props.row?.visibleToGuests ?? true);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setLocation(props.row?.location ?? '');
    setInstructions(props.row?.instructions ?? '');
    setVisible(props.row?.visibleToGuests ?? true);
  }, [
    props.kind,
    props.row?.id,
    props.row?.version,
    props.row?.location,
    props.row?.instructions,
    props.row?.visibleToGuests,
  ]);

  async function submit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (location.trim() === '') {
      setError(m.fieldRequired());
      return;
    }
    setPending(true);
    setSaved(false);
    setError(null);
    try {
      await props.onSave(location.trim(), instructions.trim(), visible);
      setSaved(true);
    } catch (caught) {
      setError(problemText(caught));
    } finally {
      setPending(false);
    }
  }

  if (props.readOnly) {
    return props.row === undefined ? (
      <p className="text-[13px] text-muted-foreground">{m.casaEmpty()}</p>
    ) : (
      <div className="grid gap-1 text-[13px]">
        <p>{props.row.location}</p>
        {props.row.instructions === '' ? null : (
          <p className="whitespace-pre-wrap text-muted-foreground">{props.row.instructions}</p>
        )}
      </div>
    );
  }

  return (
    <form className="grid gap-3" onSubmit={(event) => void submit(event)}>
      <h2 className="text-[13px] font-medium">{shutoffLabel(props.kind)}</h2>
      <Field htmlFor="shutoff-location" label={m.casaLocation()}>
        <Input id="shutoff-location" value={location} onChange={(event) => setLocation(event.target.value)} />
      </Field>
      <Field htmlFor="shutoff-instructions" label={m.casaInstructions()}>
        <Textarea
          id="shutoff-instructions"
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
        />
      </Field>
      <label className="flex h-8 items-center gap-2 text-[13px]">
        <input type="checkbox" checked={visible} onChange={(event) => setVisible(event.target.checked)} />
        {m.casaVisibleGuests()}
      </label>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {m.save()}
        </Button>
        <Status saved={saved} error={error} />
      </div>
    </form>
  );
}

function Artisans(props: {
  readonly rows: readonly Contact[];
  readonly pending: boolean;
  readonly error: string | null;
  readonly readOnly: boolean;
  readonly onCreate: (input: {
    displayName: string;
    trade: string | null;
    phone: string | null;
  }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [trade, setTrade] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (name.trim() === '') {
      setError(m.fieldRequired());
      return;
    }
    if (phone.trim() !== '' && telHref(phone.trim()) === null) {
      setError(m.casaPhoneInvalid());
      return;
    }
    setBusy(true);
    setSaved(false);
    setError(null);
    try {
      await props.onCreate({
        displayName: name.trim(),
        trade: trade.trim() === '' ? null : trade.trim(),
        phone: phone.trim() === '' ? null : phone.trim(),
      });
      setName('');
      setTrade('');
      setPhone('');
      setSaved(true);
    } catch (caught) {
      setError(problemText(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2 className="mb-3 text-[13px] font-medium">{m.casaArtisans()}</h2>
      {props.pending ? <p className="text-[13px] text-muted-foreground">{m.loading()}</p> : null}
      {props.error !== null ? (
        <p role="alert" className="text-[13px] text-destructive">
          {props.error}
        </p>
      ) : null}
      {props.rows.length === 0 ? (
        <p className="mb-3 text-[13px] text-muted-foreground">{m.casaEmpty()}</p>
      ) : null}
      <ul className="mb-4 grid gap-3">
        {props.rows.map((row) => {
          const href = telHref(row.phone);
          return (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-[13px]">
                {row.displayName}
                {row.trade === null ? '' : ` · ${row.trade}`}
              </span>
              {href === null ? null : (
                <Button asChild size="emergency">
                  <a href={href}>{m.casaCall()}</a>
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {props.readOnly ? null : (
        <form className="grid gap-3" onSubmit={(event) => void submit(event)}>
          <Field htmlFor="artisan-name" label={m.casaArtisanName()}>
            <Input id="artisan-name" value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field htmlFor="artisan-trade" label={m.casaTrade()}>
            <Input id="artisan-trade" value={trade} onChange={(event) => setTrade(event.target.value)} />
          </Field>
          <Field htmlFor="artisan-phone" label={m.casaPhone()} hint={m.casaPhoneHint()}>
            <Input
              id="artisan-phone"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </Field>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={busy}>
              {m.casaAddArtisan()}
            </Button>
            <Status saved={saved} error={error} />
          </div>
        </form>
      )}
    </section>
  );
}
