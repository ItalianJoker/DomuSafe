import { useQuery } from '@tanstack/react-query';
import { PUBLIC_TOKEN } from '@domusafe/contracts';
import { useApi } from '@/components/api-context.js';
import { Button } from '@/components/ui/button.js';
import { ApiProblem } from '@/lib/api.js';
import { m } from '@/paraglide/messages.js';
import { SheetMarkView } from '@/features/branding/mark.js';
import { bloodLabel, mobilityLabel, speciesLabel, telHref } from '@/features/personale/model.js';
import { readingDeviceLabel } from '@/features/print/device-label.js';

function shutoffLabel(kind: 'water' | 'gas' | 'electricity'): string {
  switch (kind) {
    case 'water':
      return m.casaShutoffWater();
    case 'gas':
      return m.casaShutoffGas();
    case 'electricity':
      return m.casaShutoffPower();
  }
}

function Call(props: { readonly phone: string | null; readonly label: string }) {
  const href =
    props.phone === null ? null : props.phone.startsWith('+') ? telHref(props.phone) : `tel:${props.phone}`;
  if (href === null) {
    return null;
  }
  return (
    <Button size="emergency" asChild>
      <a href={href}>{props.label}</a>
    </Button>
  );
}

function Outcome(props: { readonly error: unknown }) {
  const gone = props.error instanceof ApiProblem && props.error.problem.code === 'gone';
  return (
    <main className="mx-auto grid max-w-xl gap-4 px-4 py-8">
      <p className="text-sm text-muted-foreground">DomuSafe</p>
      <h1 className="text-3xl font-medium">{gone ? m.publicRevokedTitle() : m.publicMissingTitle()}</h1>
      <p className="text-lg">{gone ? m.publicRevoked() : m.publicMissing()}</p>
    </main>
  );
}

/**
 * House page opened by the wall-sheet code. No sign-in and no application install.
 *
 * Preconditions: `token` comes from the path.
 * Postconditions: a revoked code explains that the sheet must be replaced.
 * Data contract: cutoffs, artisans, the primary contact and the host mark. No health data and no vault text.
 *
 * @param props - Token from the address.
 * @returns The page.
 */
export function PublicHousePage(props: { readonly token: string }) {
  const api = useApi();
  const valid = PUBLIC_TOKEN.test(props.token);
  const query = useQuery({
    queryKey: ['public-house', props.token] as const,
    enabled: valid,
    retry: false,
    queryFn: () =>
      api.getPublicHousePage(
        props.token,
        readingDeviceLabel({ userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints }),
      ),
  });
  if (!valid || query.isError) {
    return <Outcome error={query.error} />;
  }
  if (query.data === undefined) {
    return <p className="p-6 text-lg text-muted-foreground">{m.loading()}</p>;
  }
  const page = query.data;
  return (
    <main className="mx-auto grid max-w-3xl gap-6 px-4 py-8">
      <SheetMarkView mark={page.mark} place="page" />
      <header>
        <h1 className="text-4xl font-medium">{page.houseName}</h1>
        {page.address === null ? null : <p className="mt-1 text-xl">{page.address}</p>}
        <p className="mt-2 text-lg text-muted-foreground">{m.publicHouseLead()}</p>
      </header>
      <div className="grid gap-3 sm:grid-cols-3">
        {page.shutoffs.map((item) => (
          <section key={`${item.kind}-${item.location}`} className="rounded-lg border border-border p-4">
            <h2 className="text-xl font-medium">{shutoffLabel(item.kind)}</h2>
            <p className="mt-2 text-lg">{item.location}</p>
            {item.instructions === '' ? null : <p className="mt-1 text-lg">{item.instructions}</p>}
          </section>
        ))}
      </div>
      <section className="grid gap-3">
        <h2 className="text-2xl font-medium">{m.printTrades()}</h2>
        {page.tradespeople.length === 0 ? <p className="text-lg">{m.printEmptyTrades()}</p> : null}
        {page.tradespeople.map((trade) => (
          <div key={trade.displayName} className="flex flex-wrap items-center gap-3">
            <p className="text-xl">
              {trade.displayName}
              {trade.trade === null ? '' : ` · ${trade.trade}`}
            </p>
            <Call phone={trade.phone} label={m.casaCall()} />
          </div>
        ))}
      </section>
      <section className="grid gap-3">
        <h2 className="text-2xl font-medium">{m.printPrimary()}</h2>
        {page.primaryContact === null ? (
          <p className="text-lg">{m.printEmptyContact()}</p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-xl">
              {page.primaryContact.displayName}
              {page.primaryContact.relationship === null ? '' : ` · ${page.primaryContact.relationship}`}
            </p>
            <Call phone={page.primaryContact.phone} label={m.casaCall()} />
          </div>
        )}
      </section>
    </main>
  );
}

/**
 * Rescue sheet opened by the emergency code. No sign-in and no application install.
 *
 * Preconditions: `token` comes from the path.
 * Postconditions: a revoked code does not show health data.
 * Data contract: the rescue sheet and the host mark. No vault text.
 *
 * @param props - Token from the address.
 * @returns The page.
 */
export function PublicRescuePage(props: { readonly token: string }) {
  const api = useApi();
  const valid = PUBLIC_TOKEN.test(props.token);
  const query = useQuery({
    queryKey: ['public-rescue', props.token] as const,
    enabled: valid,
    retry: false,
    queryFn: () =>
      api.getPublicRescueSheet(
        props.token,
        readingDeviceLabel({ userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints }),
      ),
  });
  if (!valid || query.isError) {
    return <Outcome error={query.error} />;
  }
  if (query.data === undefined) {
    return <p className="p-6 text-lg text-muted-foreground">{m.loading()}</p>;
  }
  const page = query.data;
  return (
    <main className="mx-auto grid max-w-3xl gap-6 px-4 py-8">
      <SheetMarkView mark={page.mark} place="page" />
      <header className="grid gap-3">
        <h1 className="text-4xl font-medium">{page.houseName}</h1>
        <p className="text-lg text-muted-foreground">{m.publicRescueLead()}</p>
        <Call phone="112" label={m.printCallEmergency()} />
      </header>
      {page.residents.map((person) => (
        <article key={person.id} className="grid gap-3 border-t border-border pt-4">
          <h2 className="text-3xl font-medium">{person.displayName}</h2>
          <p className="text-xl">
            {m.personaleBlood()}: {bloodLabel(person.bloodGroup)}
          </p>
          <p className="text-xl">
            {m.personaleMobility()}: {mobilityLabel(person.mobility)}
          </p>
          <p className="text-xl">
            {m.personaleAllergies()}:{' '}
            {person.allergies.length === 0 ? m.personaleNotSet() : person.allergies.join(', ')}
          </p>
          <p className="text-xl">
            {m.personaleConditions()}:{' '}
            {person.conditions.length === 0 ? m.personaleNotSet() : person.conditions.join(', ')}
          </p>
          <ul className="grid gap-1 text-xl">
            {person.medicines.map((item) => (
              <li key={item.id}>
                {item.name} — {item.location}
              </li>
            ))}
          </ul>
          {person.contacts.map((contact) => (
            <div key={contact.id} className="flex flex-wrap items-center gap-3">
              <p className="text-xl">
                {contact.displayName}
                {contact.relationship === null ? '' : ` · ${contact.relationship}`}
              </p>
              <Call phone={contact.phone} label={m.casaCall()} />
            </div>
          ))}
        </article>
      ))}
      {page.pets.map((pet) => (
        <article key={pet.id} className="grid gap-3 border-t border-border pt-4">
          <h2 className="text-2xl font-medium">
            {pet.name} · {speciesLabel(pet.species)}
          </h2>
          <p className="text-lg">{pet.vetName ?? m.personaleNotSet()}</p>
          <Call phone={pet.vetPhone} label={m.casaCall()} />
        </article>
      ))}
    </main>
  );
}
