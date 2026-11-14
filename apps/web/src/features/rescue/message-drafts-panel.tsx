import { useState } from 'react';
import { Button } from '@/components/ui/button.js';
import { m } from '@/paraglide/messages.js';
import type { RescuePerson } from './model.js';
import type { RescueSection } from './rescue-screen.js';
import {
  canDraftTo,
  rescueDraftBody,
  smsDraftHref,
  whatsAppDraftHref,
  type RescueDraftKind,
} from './message-drafts.js';

/**
 * Premium rescue drafts that open on the phone. Loaded only with the rescue screen chunk.
 *
 * Preconditions: the caller already checked Premium (or the trial) and `emergency.sos`.
 * Postconditions: every control is at least 48 pixels. DomuSafe does not send the message.
 * Data contract: house name, person name and international phone only. No health fields in the body.
 *
 * @param props - House name and the people section already loaded for the screen.
 * @returns The drafts block.
 */
export function MessageDraftsPanel(props: {
  readonly houseName: string;
  readonly people: RescueSection<readonly RescuePerson[]>;
}) {
  const [kind, setKind] = useState<RescueDraftKind>('real');
  return (
    <section className="grid gap-4" aria-label={m.rescueDraftsTitle()}>
      <div className="grid gap-2">
        <h2 className="text-2xl font-medium">{m.rescueDraftsTitle()}</h2>
        <p className="text-lg">{m.rescueDraftsLead()}</p>
      </div>
      <Button
        size="emergency"
        variant={kind === 'practice' ? 'default' : 'outline'}
        className="h-auto min-h-12 w-full border-2 text-left whitespace-normal"
        aria-pressed={kind === 'practice'}
        onClick={() => setKind((current) => (current === 'practice' ? 'real' : 'practice'))}
      >
        {kind === 'practice' ? m.rescueDraftsPracticeOn() : m.rescueDraftsPracticeOff()}
      </Button>
      <DraftList houseName={props.houseName} people={props.people} kind={kind} />
    </section>
  );
}

function DraftList(props: {
  readonly houseName: string;
  readonly people: RescueSection<readonly RescuePerson[]>;
  readonly kind: RescueDraftKind;
}) {
  switch (props.people.status) {
    case 'hidden':
      return <p className="text-lg">{m.rescueDraftsHidden()}</p>;
    case 'loading':
      return <p className="text-lg">{m.loading()}</p>;
    case 'error':
      return (
        <p role="alert" className="text-lg">
          {props.people.message}
        </p>
      );
    case 'ready': {
      const rows = draftRows(props.people.value);
      if (rows.length === 0) {
        return <p className="text-lg">{m.rescueDraftsEmpty()}</p>;
      }
      return (
        <ul className="grid gap-4">
          {rows.map((row) => (
            <DraftRow key={row.key} houseName={props.houseName} kind={props.kind} row={row} />
          ))}
        </ul>
      );
    }
  }
}

interface DraftRowModel {
  readonly key: string;
  readonly contactName: string;
  readonly personName: string;
  readonly phone: string;
}

function draftRows(people: readonly RescuePerson[]): readonly DraftRowModel[] {
  const rows: DraftRowModel[] = [];
  for (const person of people) {
    for (const contact of person.contacts) {
      if (!canDraftTo(contact.phone)) {
        continue;
      }
      rows.push({
        key: `${person.id}:${contact.id}`,
        contactName: contact.displayName,
        personName: person.displayName,
        phone: contact.phone,
      });
    }
  }
  return rows;
}

function DraftRow(props: {
  readonly houseName: string;
  readonly kind: RescueDraftKind;
  readonly row: DraftRowModel;
}) {
  const body = rescueDraftBody(
    {
      kind: props.kind,
      houseName: props.houseName,
      personName: props.row.personName,
    },
    {
      real: m.rescueDraftBodyReal,
      practice: m.rescueDraftBodyPractice,
    },
  );
  return (
    <li className="grid gap-2">
      <p className="text-xl">
        {props.row.contactName}
        {props.row.personName === props.row.contactName ? '' : ` · ${props.row.personName}`}
        {` · ${props.row.phone}`}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button size="emergency" asChild>
          <a href={smsDraftHref(props.row.phone, body)}>
            {m.rescueDraftText({ name: props.row.contactName })}
          </a>
        </Button>
        <Button size="emergency" variant="secondary" asChild>
          <a href={whatsAppDraftHref(props.row.phone, body)} rel="noopener noreferrer">
            {m.rescueDraftChat({ name: props.row.contactName })}
          </a>
        </Button>
      </div>
    </li>
  );
}
