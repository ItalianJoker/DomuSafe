import type { RescueSheet, SheetMark } from '@domusafe/contracts';
import { SheetMarkView } from '@/features/branding/mark.js';
import { m } from '@/paraglide/messages.js';
import { bloodLabel, mobilityLabel, speciesLabel } from '@/features/personale/model.js';
import type { EssentialPerson, PrintedContact, PrintedTrade, WallBox, WallKind } from './model.js';
import { QrMark } from './qr-code.js';

function shutoffLabel(kind: WallKind): string {
  switch (kind) {
    case 'water':
      return m.casaShutoffWater();
    case 'gas':
      return m.casaShutoffGas();
    case 'electricity':
      return m.casaShutoffPower();
  }
}

function CodeBlock(props: { readonly url: string | null; readonly title: string; readonly large?: boolean }) {
  return (
    <figure className="grid justify-items-center gap-1">
      {props.url === null ? (
        <p className="flex h-36 w-36 items-center text-center text-sm">{m.printCodeMissing()}</p>
      ) : (
        <QrMark value={props.url} title={props.title} {...(props.large === true ? { large: true } : {})} />
      )}
      <figcaption className="text-center text-sm font-medium">{props.title}</figcaption>
    </figure>
  );
}

/**
 * The sheet that hangs on the wall: cutoffs, artisans, the first contact, two codes and a folded strip.
 *
 * Preconditions: health facts are the essential strip only.
 * Postconditions: Free and Basic show the product mark. Advanced shows none. Premium shows the host mark.
 * Data contract: no account numbers and no notes from the address book.
 *
 * @param props - Prepared lines and the two addresses.
 * @returns The wall sheet.
 */
export function WallSheet(props: {
  readonly houseName: string;
  readonly address: string | null;
  readonly boxes: readonly WallBox[];
  readonly trades: readonly PrintedTrade[];
  readonly primary: PrintedContact | null;
  readonly people: readonly EssentialPerson[];
  readonly houseUrl: string | null;
  readonly rescueUrl: string | null;
  readonly mark: SheetMark;
}) {
  return (
    <article className="sheet-wall print-sheet">
      <SheetMarkView mark={props.mark} place="sheet" />
      <header>
        <p className="text-xs tracking-wide">{m.printWallKicker()}</p>
        <h2 className="text-3xl font-medium">{props.houseName}</h2>
        {props.address === null ? null : <p className="text-lg">{props.address}</p>}
      </header>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {props.boxes.map((box) => (
          <section key={box.kind} className="border border-black p-3">
            <h3 className="text-lg font-medium">{shutoffLabel(box.kind)}</h3>
            {box.lines.length === 0 ? <p>{m.printEmptyPlace()}</p> : null}
            {box.lines.map((line) => (
              <p key={line.location} className="mt-1">
                {line.location}
                {line.instructions === '' ? null : ` — ${line.instructions}`}
              </p>
            ))}
          </section>
        ))}
      </div>
      <section className="mt-4">
        <h3 className="text-lg font-medium">{m.printTrades()}</h3>
        {props.trades.length === 0 ? <p>{m.printEmptyTrades()}</p> : null}
        <ul>
          {props.trades.map((trade) => (
            <li key={trade.id}>
              {trade.displayName}
              {trade.trade === null ? '' : ` · ${trade.trade}`}
              {trade.phone === null ? '' : ` · ${trade.phone}`}
            </li>
          ))}
        </ul>
      </section>
      <section className="mt-4">
        <h3 className="text-lg font-medium">{m.printPrimary()}</h3>
        {props.primary === null ? (
          <p>{m.printEmptyContact()}</p>
        ) : (
          <p>
            {props.primary.displayName}
            {props.primary.relationship === null ? '' : ` · ${props.primary.relationship}`}
            {props.primary.phone === null ? '' : ` · ${props.primary.phone}`}
          </p>
        )}
      </section>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <CodeBlock url={props.houseUrl} title={m.printHouseCode()} large />
        <CodeBlock url={props.rescueUrl} title={m.printRescueCode()} />
      </div>
      <section className="sheet-flap">
        <p className="text-sm font-medium">{m.printFoldHint()}</p>
        <h3 className="text-xl font-medium">{m.printPrivacyTitle()}</h3>
        {props.people.length === 0 ? <p>{m.printEmptyHealth()}</p> : null}
        {props.people.map((person) => (
          <div key={person.id} className="mt-2">
            <p className="text-lg font-medium">{person.displayName}</p>
            <p>
              {m.personaleBlood()}: {bloodLabel(person.bloodGroup)} · {m.personaleMobility()}:{' '}
              {mobilityLabel(person.mobility)} · {m.personaleBedroom()}:{' '}
              {person.usualBedroom ?? m.personaleNotSet()}
            </p>
            <p>
              {m.personaleAllergies()}:{' '}
              {person.allergies.length === 0 ? m.personaleNotSet() : person.allergies.join(', ')}
            </p>
            <p>
              {m.personaleConditions()}:{' '}
              {person.conditions.length === 0 ? m.personaleNotSet() : person.conditions.join(', ')}
            </p>
            <p>
              {m.personaleMedicines()}:{' '}
              {person.medicines.length === 0
                ? m.personaleNotSet()
                : person.medicines.map((item) => `${item.name} (${item.location})`).join(', ')}
            </p>
          </div>
        ))}
      </section>
    </article>
  );
}

/**
 * The compact rescue sheet: health, contacts, animals and the rescue code.
 *
 * Preconditions: `sheet` is the rescue sheet, not the vault and not a bank list.
 * Postconditions: Free and Basic show the product mark. Advanced shows none. Premium shows the host mark.
 * Data contract: the same facts as the public rescue page, plus the code that opens it.
 *
 * @param props - House name, rescue sheet, address of the code and the mark.
 * @returns The compact sheet.
 */
export function CompactSheet(props: {
  readonly houseName: string;
  readonly sheet: RescueSheet;
  readonly rescueUrl: string | null;
  readonly mark: SheetMark;
}) {
  return (
    <article className="sheet-compact print-sheet">
      <SheetMarkView mark={props.mark} place="sheet" />
      <header>
        <p className="text-xs tracking-wide">{m.printCompactKicker()}</p>
        <h2 className="text-3xl font-medium">{props.houseName}</h2>
        <p className="text-lg">{m.printEmergencyLine()}</p>
      </header>
      {props.sheet.residents.length === 0 ? <p className="mt-3">{m.printEmptyHealth()}</p> : null}
      {props.sheet.residents.map((person) => (
        <section key={person.id} className="mt-3 border-t border-black pt-2">
          <h3 className="text-xl font-medium">{person.displayName}</h3>
          <p>
            {m.personaleBlood()}: {bloodLabel(person.bloodGroup)} · {m.personaleMobility()}:{' '}
            {mobilityLabel(person.mobility)}
          </p>
          <p>
            {m.personaleAllergies()}:{' '}
            {person.allergies.length === 0 ? m.personaleNotSet() : person.allergies.join(', ')}
          </p>
          <ul>
            {person.medicines.map((item) => (
              <li key={item.id}>
                {item.name} — {item.location}
              </li>
            ))}
          </ul>
          <ul>
            {person.contacts.map((contact) => (
              <li key={contact.id}>
                {contact.displayName}
                {contact.relationship === null ? '' : ` · ${contact.relationship}`}
                {contact.phone === null ? '' : ` · ${contact.phone}`}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {props.sheet.pets.map((pet) => (
        <p key={pet.id} className="mt-2">
          {pet.name} · {speciesLabel(pet.species)}
          {pet.vetPhone === null ? '' : ` · ${pet.vetPhone}`}
        </p>
      ))}
      <div className="mt-4">
        <CodeBlock url={props.rescueUrl} title={m.printRescueCode()} large />
      </div>
    </article>
  );
}
