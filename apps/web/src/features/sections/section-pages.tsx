import { EmptySection, PageHeader } from '@/components/shell/page.js';
import { m } from '@/paraglide/messages.js';

/**
 * Print section before sheets and codes exist.
 *
 * @returns The empty section.
 */
export function PrintPage() {
  return <EmptySection title={m.printTitle()} body={m.printBody()} />;
}

/**
 * Extra section before kitchen and finance exist.
 *
 * @returns The empty section.
 */
export function ExtraPage() {
  return <EmptySection title={m.extraTitle()} body={m.extraBody()} />;
}

/**
 * Short guide to the shell that is already usable.
 *
 * @returns The guide.
 */
export function GuidePage() {
  return (
    <section className="grid max-w-xl gap-6">
      <PageHeader title={m.guideTitle()} />
      <article>
        <h2 className="text-[13px] font-medium">{m.guideFamilyTitle()}</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{m.guideFamilyBody()}</p>
      </article>
      <article>
        <h2 className="text-[13px] font-medium">{m.guideHouseTitle()}</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{m.guideHouseBody()}</p>
      </article>
      <article>
        <h2 className="text-[13px] font-medium">{m.guideThemeTitle()}</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{m.guideThemeBody()}</p>
      </article>
      <article>
        <h2 className="text-[13px] font-medium">{m.guideRestTitle()}</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{m.guideRestBody()}</p>
      </article>
    </section>
  );
}
