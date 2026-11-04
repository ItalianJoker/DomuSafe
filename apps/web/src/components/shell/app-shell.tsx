import { Link, useRouterState } from '@tanstack/react-router';
import type { House, Me } from '@domusafe/contracts';
import type { ReactNode } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { NAV_LINKS, sectionFromPath } from '@/lib/navigation.js';
import { m } from '@/paraglide/messages.js';
import { Brand } from './page.js';
import { useOpenPlace } from './place.js';

const LABELS = {
  home: () => m.navHome(),
  cassaforte: () => m.navCassaforte(),
  famiglia: () => m.navFamiglia(),
  casa: () => m.navCasa(),
  personale: () => m.navPersonale(),
  stampa: () => m.navStampa(),
  extra: () => m.navExtra(),
  guida: () => m.navGuida(),
  account: () => m.navAccount(),
} as const;

/**
 * Product chrome: menu, family, house and the section content.
 *
 * Later modules render inside `children` and add a link in `LINKS` together with
 * `SECTIONS` in `src/lib/navigation.ts`. They do not build another frame.
 *
 * Preconditions: `familyId` is one of `me.families` and `houseId` is in `houses`.
 * Postconditions: changing house or family remembers the choice on the account and keeps the section.
 *
 * @param props - Account, place and content.
 * @returns The frame.
 */
export function AppShell(props: {
  readonly me: Me;
  readonly familyId: string;
  readonly houseId: string;
  readonly houses: readonly House[];
  readonly children: ReactNode;
}) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const current = sectionFromPath(pathname);
  const openPlace = useOpenPlace();
  const params = { familyId: props.familyId, houseId: props.houseId };
  const family = props.me.families.find((item) => item.id === props.familyId);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <a
        href="#contenuto"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-popover focus:px-3 focus:py-2"
      >
        {m.skipToContent()}
      </a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-border bg-sidebar print:hidden md:flex">
        <div className="flex h-12 items-center px-3">
          <Brand />
        </div>
        <nav aria-label={m.appName()} className="grid gap-0.5 px-2">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.id}
              to={link.to}
              params={params}
              aria-current={current === link.id ? 'page' : undefined}
              className={
                current === link.id
                  ? 'flex h-8 items-center rounded-md bg-accent px-2 text-[13px] text-foreground'
                  : 'flex h-8 items-center rounded-md px-2 text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground'
              }
            >
              {LABELS[link.id]()}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="print:pl-0 md:pl-56">
        <header className="sticky top-0 z-20 flex h-12 items-center gap-2 border-b border-border bg-background/85 px-3 backdrop-blur-sm print:hidden md:px-6">
          {props.me.families.length > 1 ? (
            <div className="w-40">
              <Select
                value={props.familyId}
                onValueChange={(familyId) => {
                  void openPlace(familyId, null);
                }}
              >
                <SelectTrigger aria-label={m.familySwitcher()}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {props.me.families.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <p className="truncate text-[13px] text-muted-foreground">{family?.name}</p>
          )}
          <div className="w-40">
            <Select
              value={props.houseId}
              onValueChange={(houseId) => {
                void openPlace(props.familyId, houseId);
              }}
            >
              <SelectTrigger aria-label={m.houseSwitcher()}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {props.houses.map((house) => (
                  <SelectItem key={house.id} value={house.id}>
                    {house.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="ml-auto hidden truncate text-[13px] text-muted-foreground sm:block">
            {props.me.displayName}
          </p>
        </header>
        <main id="contenuto" className="px-4 py-6 pb-24 print:p-0 md:px-8 md:pb-10">
          {props.children}
        </main>
      </div>
      <nav
        aria-label={m.appName()}
        className="fixed inset-x-0 bottom-0 z-30 flex gap-1 overflow-x-auto border-t border-border bg-background px-2 pt-1 print:hidden md:hidden"
        style={{ paddingBottom: 'max(0.25rem, env(safe-area-inset-bottom))' }}
      >
        {NAV_LINKS.map((link) => (
          <Link
            key={link.id}
            to={link.to}
            params={params}
            aria-current={current === link.id ? 'page' : undefined}
            className={
              current === link.id
                ? 'flex h-10 shrink-0 items-center rounded-md bg-accent px-2.5 text-[12px] text-foreground'
                : 'flex h-10 shrink-0 items-center rounded-md px-2.5 text-[12px] text-muted-foreground'
            }
          >
            {LABELS[link.id]()}
          </Link>
        ))}
      </nav>
    </div>
  );
}
