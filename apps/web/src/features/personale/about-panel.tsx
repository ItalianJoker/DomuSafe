import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { ResidentAboutCard } from '@domusafe/contracts';
import { useApi } from '@/components/api-context.js';
import { Field } from '@/components/shell/page.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Textarea } from '@/components/ui/textarea.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { problemText } from '@/lib/copy.js';
import { aboutQuery, residentsQuery } from '@/lib/queries.js';
import { m } from '@/paraglide/messages.js';
import { linesToList, listToLines } from './model.js';

interface AboutDraft {
  preferredName: string;
  howToAddress: string;
  likes: string;
  dislikes: string;
  dailyRoutine: string;
  calmingTips: string;
  communicationTips: string;
  importantNotes: string;
}

function draftFrom(card: ResidentAboutCard): AboutDraft {
  return {
    preferredName: card.preferredName ?? '',
    howToAddress: card.howToAddress ?? '',
    likes: listToLines(card.likes),
    dislikes: listToLines(card.dislikes),
    dailyRoutine: card.dailyRoutine ?? '',
    calmingTips: card.calmingTips ?? '',
    communicationTips: card.communicationTips ?? '',
    importantNotes: card.importantNotes ?? '',
  };
}

/**
 * «Chi sono» caregiver identity sheet for people in the open house.
 *
 * Preconditions: the caller can read health data. Writes require `health.write`.
 * Postconditions: saving replaces the whole sheet with an If-Match version.
 * Data contract: likes and dislikes are one phrase per line.
 *
 * @param props - Family, house and whether the person may edit.
 * @returns The tab.
 */
export function AboutPanel(props: {
  readonly familyId: string;
  readonly houseId: string;
  readonly canWrite: boolean;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const people = useQuery(residentsQuery(api, props.familyId, props.houseId));
  const [selected, setSelected] = useState<string | null>(null);
  const residentId = selected ?? people.data?.[0]?.id ?? null;
  const about = useQuery({
    ...aboutQuery(api, props.familyId, residentId ?? ''),
    enabled: residentId !== null,
  });

  if ((people.data?.length ?? 0) === 0) {
    return <p className="text-[13px] text-muted-foreground">{m.personaleNone()}</p>;
  }

  return (
    <div className="grid gap-6">
      <div>
        <h2 className="text-[13px] font-medium">{m.aboutTitle()}</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">{m.aboutLead()}</p>
      </div>
      {(people.data?.length ?? 0) > 1 ? (
        <Field label={m.personalePick()} htmlFor="about-pick">
          <Select value={residentId ?? ''} onValueChange={setSelected}>
            <SelectTrigger id="about-pick">
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
      {residentId === null || about.data === undefined ? (
        <p className="text-[13px] text-muted-foreground">
          {about.isError ? problemText(about.error) : m.loading()}
        </p>
      ) : (
        <AboutForm
          familyId={props.familyId}
          residentId={residentId}
          card={about.data}
          canWrite={props.canWrite}
          onSaved={async () => {
            await queryClient.invalidateQueries({ queryKey: ['about', props.familyId, residentId] });
          }}
        />
      )}
    </div>
  );
}

function AboutForm(props: {
  readonly familyId: string;
  readonly residentId: string;
  readonly card: ResidentAboutCard;
  readonly canWrite: boolean;
  readonly onSaved: () => Promise<void>;
}) {
  const api = useApi();
  const [draft, setDraft] = useState(() => draftFrom(props.card));
  const [version, setVersion] = useState(props.card.version);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraft(draftFrom(props.card));
    setVersion(props.card.version);
    setSaved(false);
    setError(null);
  }, [props.card]);

  async function save(): Promise<void> {
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      const next = await api.putAbout(props.familyId, props.residentId, version, {
        preferredName: draft.preferredName.trim() === '' ? null : draft.preferredName.trim(),
        howToAddress: draft.howToAddress.trim() === '' ? null : draft.howToAddress.trim(),
        likes: linesToList(draft.likes),
        dislikes: linesToList(draft.dislikes),
        dailyRoutine: draft.dailyRoutine.trim() === '' ? null : draft.dailyRoutine.trim(),
        calmingTips: draft.calmingTips.trim() === '' ? null : draft.calmingTips.trim(),
        communicationTips: draft.communicationTips.trim() === '' ? null : draft.communicationTips.trim(),
        importantNotes: draft.importantNotes.trim() === '' ? null : draft.importantNotes.trim(),
      });
      setVersion(next.version);
      setDraft(draftFrom(next));
      setSaved(true);
      await props.onSaved();
    } catch (caught) {
      setError(problemText(caught));
    } finally {
      setPending(false);
    }
  }

  const empty =
    draft.preferredName === '' &&
    draft.howToAddress === '' &&
    draft.likes === '' &&
    draft.dislikes === '' &&
    draft.dailyRoutine === '' &&
    draft.calmingTips === '' &&
    draft.communicationTips === '' &&
    draft.importantNotes === '';

  return (
    <div className="grid max-w-xl gap-4">
      {empty && !props.canWrite ? (
        <p className="text-[13px] text-muted-foreground">{m.aboutEmpty()}</p>
      ) : null}
      <Field label={m.aboutPreferredName()} htmlFor="about-name">
        <Input
          id="about-name"
          value={draft.preferredName}
          disabled={!props.canWrite || pending}
          onChange={(event) => setDraft({ ...draft, preferredName: event.target.value })}
        />
      </Field>
      <Field label={m.aboutHowToAddress()} htmlFor="about-address">
        <Textarea
          id="about-address"
          value={draft.howToAddress}
          disabled={!props.canWrite || pending}
          onChange={(event) => setDraft({ ...draft, howToAddress: event.target.value })}
        />
      </Field>
      <Field label={m.aboutLikes()} htmlFor="about-likes" hint={m.personaleLinesHint()}>
        <Textarea
          id="about-likes"
          value={draft.likes}
          disabled={!props.canWrite || pending}
          onChange={(event) => setDraft({ ...draft, likes: event.target.value })}
        />
      </Field>
      <Field label={m.aboutDislikes()} htmlFor="about-dislikes" hint={m.personaleLinesHint()}>
        <Textarea
          id="about-dislikes"
          value={draft.dislikes}
          disabled={!props.canWrite || pending}
          onChange={(event) => setDraft({ ...draft, dislikes: event.target.value })}
        />
      </Field>
      <Field label={m.aboutRoutine()} htmlFor="about-routine">
        <Textarea
          id="about-routine"
          value={draft.dailyRoutine}
          disabled={!props.canWrite || pending}
          onChange={(event) => setDraft({ ...draft, dailyRoutine: event.target.value })}
        />
      </Field>
      <Field label={m.aboutCalming()} htmlFor="about-calming">
        <Textarea
          id="about-calming"
          value={draft.calmingTips}
          disabled={!props.canWrite || pending}
          onChange={(event) => setDraft({ ...draft, calmingTips: event.target.value })}
        />
      </Field>
      <Field label={m.aboutCommunication()} htmlFor="about-communication">
        <Textarea
          id="about-communication"
          value={draft.communicationTips}
          disabled={!props.canWrite || pending}
          onChange={(event) => setDraft({ ...draft, communicationTips: event.target.value })}
        />
      </Field>
      <Field label={m.aboutNotes()} htmlFor="about-notes">
        <Textarea
          id="about-notes"
          value={draft.importantNotes}
          disabled={!props.canWrite || pending}
          onChange={(event) => setDraft({ ...draft, importantNotes: event.target.value })}
        />
      </Field>
      {error !== null ? (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      ) : null}
      {saved ? <p className="text-[13px] text-muted-foreground">{m.aboutSaved()}</p> : null}
      {props.canWrite ? (
        <Button size="emergency" disabled={pending} onClick={() => void save()}>
          {m.personaleSave()}
        </Button>
      ) : null}
    </div>
  );
}
