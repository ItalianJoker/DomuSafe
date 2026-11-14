import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button.js';
import { telHref } from '@/features/personale/model.js';
import { MEDICAL_EMERGENCY_TEL, type RescueCutoff } from '@/features/rescue/model.js';
import { rescuePath } from '@/features/rescue/path.js';
import { m } from '@/paraglide/messages.js';
import type { KioskContact, KioskDeadline, KioskMedicine } from './model.js';

/** A block of the gallery: hidden for this role, still loading, failed, or ready. */
export type KioskSection<T> =
  | { readonly status: 'hidden' }
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly value: T };

/**
 * Full-screen tablet gallery with large translucent widgets for caregivers and elderly people.
 *
 * Preconditions: each section describes the open house, or explains why it is absent.
 * Postconditions: call and close controls are at least 48 pixels; primary call tiles prefer 64.
 * Data contract: contacts, cutoffs, next deadlines and lifesaving medicines. No vault.
 *
 * @param props - House ids, section data and the close handler.
 * @returns The gallery.
 */
export function KioskScreen(props: {
  readonly familyId: string;
  readonly houseId: string;
  readonly houseName: string;
  readonly contacts: KioskSection<readonly KioskContact[]>;
  readonly cutoffs: KioskSection<readonly RescueCutoff[]>;
  readonly deadlines: KioskSection<readonly KioskDeadline[]>;
  readonly medicines: KioskSection<readonly KioskMedicine[]>;
  readonly onClose: () => void;
}) {
  const callRef = useRef<HTMLAnchorElement>(null);
  const [full, setFull] = useState(false);

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

  useEffect(() => {
    function onChange(): void {
      setFull(document.fullscreenElement !== null);
    }
    document.addEventListener('fullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
    };
  }, []);

  async function toggleFullscreen(): Promise<void> {
    try {
      if (document.fullscreenElement !== null) {
        await document.exitFullscreen();
        return;
      }
      await document.documentElement.requestFullscreen();
    } catch {
      setFull(false);
    }
  }

  return (
    <main className="kiosk-screen min-h-dvh px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6">
      <div className="mx-auto grid max-w-6xl gap-5">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-lg font-medium text-white/80">{m.kioskTitle()}</p>
            <h1 className="text-4xl font-medium tracking-tight text-white sm:text-5xl">{props.houseName}</h1>
            <p className="mt-2 max-w-2xl text-lg text-white/75">{m.kioskLead()}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              size="emergency"
              variant="outline"
              className="min-h-14 border-white/40 bg-white/10 px-5 text-lg text-white backdrop-blur-md hover:bg-white/20"
              onClick={() => void toggleFullscreen()}
            >
              {full ? m.kioskExitFullscreen() : m.kioskFullscreen()}
            </Button>
            <Button
              size="emergency"
              variant="outline"
              className="min-h-14 border-white/40 bg-white/10 px-5 text-lg text-white backdrop-blur-md hover:bg-white/20"
              aria-label={m.kioskClose()}
              onClick={props.onClose}
            >
              {m.kioskCloseShort()}
            </Button>
          </div>
        </header>

        <Button
          size="emergency"
          variant="destructive"
          className="h-auto min-h-16 w-full text-2xl shadow-lg"
          asChild
        >
          <a ref={callRef} href={MEDICAL_EMERGENCY_TEL}>
            {m.rescueCall()}
          </a>
        </Button>

        <div className="grid gap-4 lg:grid-cols-2">
          <Widget title={m.kioskContacts()} ariaLabel={m.kioskContacts()}>
            <SectionBody
              section={props.contacts}
              hidden={m.rescueHiddenPeople()}
              ready={(contacts) =>
                contacts.length === 0 ? (
                  <p className="text-xl text-white/80">{m.kioskEmptyContacts()}</p>
                ) : (
                  <ul className="grid gap-3">
                    {contacts.map((contact) => (
                      <ContactTile key={`${contact.personName}:${contact.id}`} contact={contact} />
                    ))}
                  </ul>
                )
              }
            />
          </Widget>

          <Widget title={m.kioskCutoffs()} ariaLabel={m.kioskCutoffs()}>
            <SectionBody
              section={props.cutoffs}
              hidden={m.rescueHiddenCutoffs()}
              ready={(groups) => (
                <div className="grid gap-3 sm:grid-cols-3">
                  {groups.map((group) => (
                    <article
                      key={group.kind}
                      className="rounded-xl border border-white/20 bg-black/20 p-4 backdrop-blur-sm"
                    >
                      <h3 className="text-xl font-medium text-white">{cutoffLabel(group.kind)}</h3>
                      {group.places.length === 0 ? (
                        <p className="mt-2 text-lg text-white/75">{m.printEmptyPlace()}</p>
                      ) : null}
                      {group.places.map((place) => (
                        <p key={place.id} className="mt-2 text-lg text-white/90">
                          {place.location}
                          {place.instructions === '' ? '' : ` — ${place.instructions}`}
                        </p>
                      ))}
                    </article>
                  ))}
                </div>
              )}
            />
          </Widget>

          <Widget title={m.kioskDeadlines()} ariaLabel={m.kioskDeadlines()}>
            <SectionBody
              section={props.deadlines}
              hidden={m.kioskHiddenDeadlines()}
              ready={(items) =>
                items.length === 0 ? (
                  <p className="text-xl text-white/80">{m.kioskEmptyDeadlines()}</p>
                ) : (
                  <ul className="grid gap-3">
                    {items.map((item) => (
                      <li
                        key={item.key}
                        className="rounded-xl border border-white/20 bg-black/20 px-4 py-4 backdrop-blur-sm"
                      >
                        <p className="text-xl font-medium text-white">{item.label}</p>
                        <p className="mt-1 text-lg text-white/75">
                          {deadlineGroupLabel(item.group)} · {item.dueDate}
                        </p>
                      </li>
                    ))}
                  </ul>
                )
              }
            />
          </Widget>

          <Widget title={m.kioskMedicines()} ariaLabel={m.kioskMedicines()}>
            <SectionBody
              section={props.medicines}
              hidden={m.rescueHiddenPeople()}
              ready={(items) =>
                items.length === 0 ? (
                  <p className="text-xl text-white/80">{m.kioskEmptyMedicines()}</p>
                ) : (
                  <ul className="grid gap-3">
                    {items.map((item) => (
                      <li
                        key={`${item.personName}:${item.id}`}
                        className="rounded-xl border border-white/20 bg-black/20 px-4 py-4 backdrop-blur-sm"
                      >
                        <p className="text-2xl font-medium text-white">{item.name}</p>
                        <p className="mt-1 text-lg text-white/80">
                          {item.personName} · {item.location}
                        </p>
                      </li>
                    ))}
                  </ul>
                )
              }
            />
          </Widget>
        </div>

        <div className="pt-1">
          <Button
            size="emergency"
            variant="outline"
            className="min-h-14 w-full border-white/40 bg-white/10 px-5 text-lg text-white backdrop-blur-md hover:bg-white/20 sm:w-auto"
            asChild
          >
            <a href={rescuePath(props.familyId, props.houseId)}>{m.rescueOpen()}</a>
          </Button>
        </div>
      </div>
    </main>
  );
}

function Widget(props: { readonly title: string; readonly ariaLabel: string; readonly children: ReactNode }) {
  return (
    <section
      aria-label={props.ariaLabel}
      className="kiosk-widget grid gap-4 rounded-2xl border border-white/25 bg-white/10 p-5 shadow-[0_12px_40px_rgba(0,0,0,0.28)] backdrop-blur-xl sm:p-6"
    >
      <h2 className="text-2xl font-medium tracking-tight text-white sm:text-3xl">{props.title}</h2>
      {props.children}
    </section>
  );
}

function ContactTile(props: { readonly contact: KioskContact }) {
  const contact = props.contact;
  const href = telHref(contact.phone);
  return (
    <li className="grid gap-3 rounded-xl border border-white/20 bg-black/20 p-4 backdrop-blur-sm">
      <div>
        <p className="text-2xl font-medium text-white">{contact.displayName}</p>
        <p className="mt-1 text-lg text-white/75">
          {contact.personName}
          {contact.relationship === null ? '' : ` · ${contact.relationship}`}
          {contact.phone === null ? '' : ` · ${contact.phone}`}
        </p>
      </div>
      {href === null ? (
        <p className="text-lg text-white/70">{m.kioskNoPhone()}</p>
      ) : (
        <Button size="emergency" className="min-h-16 w-full text-xl" asChild>
          <a href={href}>{m.rescueCallPerson({ name: contact.displayName })}</a>
        </Button>
      )}
    </li>
  );
}

function SectionBody<T>(props: {
  readonly section: KioskSection<T>;
  readonly hidden: string;
  readonly ready: (value: T) => ReactNode;
}) {
  switch (props.section.status) {
    case 'hidden':
      return <p className="text-xl text-white/80">{props.hidden}</p>;
    case 'loading':
      return <p className="text-xl text-white/80">{m.loading()}</p>;
    case 'error':
      return (
        <p role="alert" className="text-xl text-white">
          {props.section.message}
        </p>
      );
    case 'ready':
      return props.ready(props.section.value);
  }
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

function deadlineGroupLabel(group: KioskDeadline['group']): string {
  switch (group) {
    case 'overdue':
      return m.deadlinesOverdue();
    case 'week':
      return m.deadlinesWeek();
    case 'month':
      return m.deadlinesMonth();
  }
}
