import type { House, Me } from '@domusafe/contracts';
import { PageHeader } from '@/components/shell/page.js';
import { m } from '@/paraglide/messages.js';

/**
 * Landing page inside a house. It points at the sections without pretending they are filled in.
 *
 * @param props - Account and the open house.
 * @returns The dashboard.
 */
export function HomePage(props: { readonly me: Me; readonly house: House; readonly familyName: string }) {
  return (
    <section>
      <PageHeader title={m.welcome({ name: props.me.displayName })} lead={m.homeLead()} />
      <p className="text-[13px] text-muted-foreground">
        {props.house.name} · {props.familyName}
      </p>
    </section>
  );
}
