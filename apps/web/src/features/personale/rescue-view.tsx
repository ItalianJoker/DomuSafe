import type { RescueSheet } from '@domusafe/contracts';
import { Button } from '@/components/ui/button.js';
import { m } from '@/paraglide/messages.js';
import { bloodLabel, mobilityLabel, speciesLabel, telHref } from './model.js';

function Fact(props: { readonly label: string; readonly value: string }) {
  return (
    <div>
      <dt className="text-[13px] text-muted-foreground">{props.label}</dt>
      <dd className="text-lg">{props.value}</dd>
    </div>
  );
}

/**
 * Large, readable rescue sheet for the open house.
 *
 * Preconditions: `sheet` comes from the rescue-sheet route.
 * Postconditions: phone numbers that are international become call controls of at least 48 pixels.
 * Data contract: nothing on the sheet is an account number.
 *
 * @param props - The sheet.
 * @returns The readable view.
 */
export function RescueView(props: { readonly sheet: RescueSheet }) {
  const empty = props.sheet.residents.length === 0 && props.sheet.pets.length === 0;
  return (
    <section
      className="grid gap-6 rounded-lg border border-border bg-card p-4"
      aria-label={m.personaleRescueTitle()}
    >
      <h2 className="text-xl font-medium">{m.personaleRescueTitle()}</h2>
      {empty ? <p className="text-base text-muted-foreground">{m.personaleEmptyRescue()}</p> : null}
      {props.sheet.residents.map((person) => (
        <article key={person.id} className="grid gap-3 border-t border-border pt-4">
          <header className="flex items-center gap-3">
            {person.photo === null ? null : (
              <img src={person.photo} alt="" className="size-16 rounded-md object-cover" />
            )}
            <h3 className="text-2xl font-medium">{person.displayName}</h3>
          </header>
          <dl className="grid gap-3 sm:grid-cols-2">
            <Fact
              label={m.personaleBirthYear()}
              value={person.birthYear === null ? m.personaleNotSet() : String(person.birthYear)}
            />
            <Fact label={m.personaleBedroom()} value={person.usualBedroom ?? m.personaleNotSet()} />
            <Fact label={m.personaleBlood()} value={bloodLabel(person.bloodGroup)} />
            <Fact label={m.personaleMobility()} value={mobilityLabel(person.mobility)} />
          </dl>
          <Fact
            label={m.personaleAllergies()}
            value={person.allergies.length === 0 ? m.personaleNotSet() : person.allergies.join(', ')}
          />
          <Fact
            label={m.personaleConditions()}
            value={person.conditions.length === 0 ? m.personaleNotSet() : person.conditions.join(', ')}
          />
          <Fact
            label={m.personaleDevices()}
            value={person.devices.length === 0 ? m.personaleNotSet() : person.devices.join(', ')}
          />
          <div>
            <h4 className="text-[13px] text-muted-foreground">{m.personaleMedicines()}</h4>
            {person.medicines.length === 0 ? (
              <p className="text-lg">{m.personaleNotSet()}</p>
            ) : (
              <ul className="mt-1 grid gap-1">
                {person.medicines.map((medicine) => (
                  <li key={medicine.id} className="text-lg">
                    {medicine.name} — {medicine.location}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="grid gap-3">
            <h4 className="text-[13px] text-muted-foreground">{m.personaleContacts()}</h4>
            {person.contacts.map((contact) => {
              const href = telHref(contact.phone);
              return (
                <div key={contact.id} className="flex flex-wrap items-center gap-3">
                  <p className="text-lg">
                    {contact.displayName}
                    {contact.relationship === null ? '' : ` · ${contact.relationship}`}
                  </p>
                  <p>{contact.hasKeys ? m.personaleKeysYes() : m.personaleKeysNo()}</p>
                  {href === null ? null : (
                    <Button size="emergency" asChild>
                      <a href={href}>{m.casaCall()}</a>
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </article>
      ))}
      {props.sheet.pets.map((pet) => {
        const href = telHref(pet.vetPhone);
        return (
          <article key={pet.id} className="grid gap-2 border-t border-border pt-4">
            <h3 className="text-xl font-medium">
              {pet.name} · {speciesLabel(pet.species)}
            </h3>
            <p className="text-lg">{pet.vetName ?? m.personaleNotSet()}</p>
            <p>{pet.vetAddress ?? m.personaleNotSet()}</p>
            {href === null ? null : (
              <Button size="emergency" asChild>
                <a href={href}>{m.casaCall()}</a>
              </Button>
            )}
          </article>
        );
      })}
    </section>
  );
}
