import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from '@/components/ui/button.js';
import { bloodLabel, mobilityLabel, telHref } from '@/features/personale/model.js';
import { m } from '@/paraglide/messages.js';
import { MEDICAL_EMERGENCY_TEL, type RescueContact, type RescueCutoff, type RescuePerson } from './model.js';

/** A block of the screen: hidden for this role, still loading, failed, or ready. */
export type RescueSection<T> =
  | { readonly status: 'hidden' }
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly value: T };

/**
 * Full-screen rescue view. High-contrast colors come from `.rescue-screen` in both themes.
 *
 * Preconditions: `cutoffs` and `people` describe the open house, or explain why they are absent.
 * Postconditions: the medical-emergency control and the close control are at least 48 pixels.
 * Data contract: cutoffs, essential cards and ordered contacts. No vault and no account numbers.
 *
 * @param props - House name, the two sections and the close handler.
 * @returns The screen.
 */
export function RescueScreen(props: {
  readonly houseName: string;
  readonly cutoffs: RescueSection<readonly RescueCutoff[]>;
  readonly people: RescueSection<readonly RescuePerson[]>;
  readonly onClose: () => void;
}) {
  const callRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    callRef.current?.focus();
  }, []);
  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        props.onClose();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [props.onClose]);

  return (
    <main className="rescue-screen min-h-dvh px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto grid max-w-3xl gap-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-base font-medium">{m.rescueTitle()}</p>
            <h1 className="text-3xl font-medium">{props.houseName}</h1>
          </div>
          <Button
            size="emergency"
            variant="outline"
            className="border-2"
            aria-label={m.rescueClose()}
            onClick={props.onClose}
          >
            {m.rescueCloseShort()}
          </Button>
        </header>
        <Button size="emergency" variant="destructive" className="h-auto min-h-16 w-full text-xl" asChild>
          <a ref={callRef} href={MEDICAL_EMERGENCY_TEL}>
            {m.rescueCall()}
          </a>
        </Button>
        <section className="grid gap-3" aria-label={m.rescueCutoffs()}>
          <h2 className="text-2xl font-medium">{m.rescueCutoffs()}</h2>
          <SectionBody
            section={props.cutoffs}
            hidden={m.rescueHiddenCutoffs()}
            ready={(groups) => (
              <div className="grid gap-3 sm:grid-cols-3">
                {groups.map((group) => (
                  <article key={group.kind} className="border-2 border-border p-4">
                    <h3 className="text-xl font-medium">{cutoffLabel(group.kind)}</h3>
                    {group.places.length === 0 ? <p className="mt-2 text-lg">{m.printEmptyPlace()}</p> : null}
                    {group.places.map((place) => (
                      <p key={place.id} className="mt-2 text-lg">
                        {place.location}
                        {place.instructions === '' ? '' : ` — ${place.instructions}`}
                      </p>
                    ))}
                  </article>
                ))}
              </div>
            )}
          />
        </section>
        <section className="grid gap-4" aria-label={m.rescuePeople()}>
          <h2 className="text-2xl font-medium">{m.rescuePeople()}</h2>
          <SectionBody
            section={props.people}
            hidden={m.rescueHiddenPeople()}
            ready={(cards) =>
              cards.length === 0 ? (
                <p className="text-lg">{m.rescueEmptyPeople()}</p>
              ) : (
                <div className="grid gap-4">
                  {cards.map((person) => (
                    <PersonCard key={person.id} person={person} />
                  ))}
                </div>
              )
            }
          />
        </section>
      </div>
    </main>
  );
}

function cutoffLabel(kind: RescueCutoff['kind']): string {
  switch (kind) {
    case 'water':
      return m.casaShutoffWater();
    case 'gas':
      return m.casaShutoffGas();
    case 'electricity':
      return m.casaShutoffPower();
  }
}

function SectionBody<T>(props: {
  readonly section: RescueSection<T>;
  readonly hidden: string;
  readonly ready: (value: T) => ReactNode;
}) {
  switch (props.section.status) {
    case 'hidden':
      return <p className="text-lg">{props.hidden}</p>;
    case 'loading':
      return <p className="text-lg">{m.loading()}</p>;
    case 'error':
      return (
        <p role="alert" className="text-lg">
          {props.section.message}
        </p>
      );
    case 'ready':
      return props.ready(props.section.value);
  }
}

function PersonCard(props: { readonly person: RescuePerson }) {
  const person = props.person;
  return (
    <article className="grid gap-4 border-2 border-border p-4">
      <h3 className="text-3xl font-medium">{person.displayName}</h3>
      <dl className="grid gap-3 sm:grid-cols-2">
        <Fact label={m.personaleBlood()} value={bloodLabel(person.bloodGroup)} />
        <Fact label={m.personaleMobility()} value={mobilityLabel(person.mobility)} />
        <Fact label={m.personaleBedroom()} value={person.usualBedroom ?? m.personaleNotSet()} />
        <Fact
          label={m.personaleAllergies()}
          value={person.allergies.length === 0 ? m.personaleNotSet() : person.allergies.join(', ')}
        />
      </dl>
      <div>
        <h4 className="text-base font-medium">{m.personaleMedicines()}</h4>
        {person.medicines.length === 0 ? (
          <p className="text-lg">{m.rescueNoMedicines()}</p>
        ) : (
          <ul className="mt-1 grid gap-1">
            {person.medicines.map((medicine) => (
              <li key={medicine.id} className="text-xl">
                {medicine.name} — {medicine.location}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h4 className="text-base font-medium">{m.personaleContacts()}</h4>
        {person.contacts.length === 0 ? (
          <p className="text-lg">{m.rescueNoContacts()}</p>
        ) : (
          <ol className="mt-2 grid gap-3">
            {person.contacts.map((contact, index) => (
              <ContactRow key={contact.id} contact={contact} index={index} />
            ))}
          </ol>
        )}
      </div>
    </article>
  );
}

function ContactRow(props: { readonly contact: RescueContact; readonly index: number }) {
  const contact = props.contact;
  const href = telHref(contact.phone);
  return (
    <li className="grid gap-2">
      <p className="text-xl">
        {String(props.index + 1)}. {contact.displayName}
        {contact.relationship === null ? '' : ` · ${contact.relationship}`}
        {contact.phone === null ? '' : ` · ${contact.phone}`}
      </p>
      {href === null ? null : (
        <Button size="emergency" asChild>
          <a href={href}>{m.rescueCallPerson({ name: contact.displayName })}</a>
        </Button>
      )}
    </li>
  );
}

function Fact(props: { readonly label: string; readonly value: string }) {
  return (
    <div>
      <dt className="text-base font-medium">{props.label}</dt>
      <dd className="text-2xl">{props.value}</dd>
    </div>
  );
}
