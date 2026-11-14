import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { Handover, HandoverAudience } from '@domusafe/contracts';
import { useApi } from '@/components/api-context.js';
import { Field } from '@/components/shell/page.js';
import { Button } from '@/components/ui/button.js';
import { Textarea } from '@/components/ui/textarea.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { problemText } from '@/lib/copy.js';
import { handoversQuery } from '@/lib/queries.js';
import { m } from '@/paraglide/messages.js';

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString();
}

function audienceLabel(audience: HandoverAudience): string {
  return audience === 'guest' ? m.handoverAudienceGuest() : m.handoverAudienceFamily();
}

/**
 * Caregiver handover notes for the open family and house.
 *
 * Preconditions: the caller can read care data. Writing and deleting need `care.write`.
 * Postconditions: acknowledgement marks a note as read with If-Match.
 * Data contract: notes are plain text; guest notes are visible to guests.
 *
 * @param props - Family, house and write permission.
 * @returns The panel.
 */
export function HandoverPanel(props: {
  readonly familyId: string;
  readonly houseId: string;
  readonly canWrite: boolean;
  readonly guestMode?: boolean;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const list = useQuery(handoversQuery(api, props.familyId, props.houseId));
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<HandoverAudience>(props.guestMode === true ? 'guest' : 'family');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    await queryClient.invalidateQueries({ queryKey: ['handovers', props.familyId, props.houseId] });
  }

  async function add(): Promise<void> {
    if (body.trim() === '') {
      setError(m.handoverNeedBody());
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api.createHandover(props.familyId, crypto.randomUUID(), {
        body: body.trim(),
        audience: props.guestMode === true ? 'guest' : audience,
        houseId: props.houseId,
      });
      setBody('');
      await refresh();
    } catch (caught) {
      setError(problemText(caught));
    } finally {
      setPending(false);
    }
  }

  async function acknowledge(item: Handover): Promise<void> {
    setPending(true);
    setError(null);
    try {
      await api.acknowledgeHandover(props.familyId, item.id, item.version);
      await refresh();
    } catch (caught) {
      setError(problemText(caught));
    } finally {
      setPending(false);
    }
  }

  async function remove(item: Handover): Promise<void> {
    setPending(true);
    setError(null);
    try {
      await api.deleteHandover(props.familyId, item.id, item.version);
      await refresh();
    } catch (caught) {
      setError(problemText(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-4">
      <div>
        <h2 className="text-[13px] font-medium">{m.handoverTitle()}</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{m.handoverLead()}</p>
      </div>

      {props.canWrite ? (
        <div className="grid gap-3">
          <Field label={m.handoverBody()} htmlFor="handover-body">
            <Textarea
              id="handover-body"
              value={body}
              disabled={pending}
              onChange={(event) => setBody(event.target.value)}
            />
          </Field>
          {props.guestMode === true ? null : (
            <Field label={m.handoverAudience()} htmlFor="handover-audience">
              <Select value={audience} onValueChange={(value) => setAudience(value as HandoverAudience)}>
                <SelectTrigger id="handover-audience">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="family">{m.handoverAudienceFamily()}</SelectItem>
                  <SelectItem value="guest">{m.handoverAudienceGuest()}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          )}
          <Button size="emergency" disabled={pending} onClick={() => void add()}>
            {m.handoverAdd()}
          </Button>
        </div>
      ) : null}

      {error !== null ? (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      ) : null}

      {list.data === undefined ? (
        <p className="text-[13px] text-muted-foreground">
          {list.isError ? problemText(list.error) : m.loading()}
        </p>
      ) : list.data.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">{m.handoverNone()}</p>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {list.data.map((item) => (
            <li key={item.id} className="grid gap-2 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[12px] text-muted-foreground">
                  {formatWhen(item.postedAt)} · {audienceLabel(item.audience)} ·{' '}
                  {item.acknowledgedAt === null ? m.handoverOpen() : m.handoverAcknowledged()}
                </p>
              </div>
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{item.body}</p>
              <div className="flex flex-wrap gap-2">
                {item.acknowledgedAt === null ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => void acknowledge(item)}
                  >
                    {m.handoverAcknowledge()}
                  </Button>
                ) : null}
                {props.canWrite && props.guestMode !== true ? (
                  <Button variant="ghost" size="sm" disabled={pending} onClick={() => void remove(item)}>
                    {m.handoverRemove()}
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
