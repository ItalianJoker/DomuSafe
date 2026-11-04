/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/only-throw-error --
   Route components close over their route while it is still being created, so context is inferred as any.
   `throw redirect()` is how a loader leaves for another path. */
import type { QueryClient } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { ClientsProvider } from '@/components/api-context.js';
import { AppShell } from '@/components/shell/app-shell.js';
import type { House, Me } from '@domusafe/contracts';
import { ApiProblem, type DomusafeApi } from '@/lib/api.js';
import { pickFamilyId, pickHouseId } from '@/lib/entry.js';
import { housesQuery, meQuery } from '@/lib/queries.js';
import type { SessionClient } from '@/lib/session.js';
import { applyTheme } from '@/lib/theme.js';
import { m } from '@/paraglide/messages.js';

/** Dependencies every route can read before it renders. */
export interface RouterContext {
  readonly queryClient: QueryClient;
  readonly api: DomusafeApi;
  readonly session: SessionClient;
}

const LoginPage = lazy(() =>
  import('@/features/access/access-pages.js').then((mod) => ({ default: mod.LoginPage })),
);
const SignupPage = lazy(() =>
  import('@/features/access/access-pages.js').then((mod) => ({ default: mod.SignupPage })),
);
const CreateFamilyPage = lazy(() =>
  import('@/features/family/family-pages.js').then((mod) => ({ default: mod.CreateFamilyPage })),
);
const FamilyPage = lazy(() =>
  import('@/features/family/family-pages.js').then((mod) => ({ default: mod.FamilyPage })),
);
const HomePage = lazy(() =>
  import('@/features/home/home-page.js').then((mod) => ({ default: mod.HomePage })),
);
const HousePage = lazy(() =>
  import('@/features/house/house-page.js').then((mod) => ({ default: mod.HousePage })),
);
const AccountPage = lazy(() =>
  import('@/features/account/account-page.js').then((mod) => ({ default: mod.AccountPage })),
);
const sections = () => import('@/features/sections/section-pages.js');
const VaultPage = lazy(() => sections().then((mod) => ({ default: mod.VaultPage })));
const PersonalPage = lazy(() => sections().then((mod) => ({ default: mod.PersonalPage })));
const PrintPage = lazy(() => sections().then((mod) => ({ default: mod.PrintPage })));
const ExtraPage = lazy(() => sections().then((mod) => ({ default: mod.ExtraPage })));
const GuidePage = lazy(() => sections().then((mod) => ({ default: mod.GuidePage })));

/**
 * Shows a quiet loading line while a section chunk arrives.
 *
 * @param props - The section.
 * @returns The boundary.
 */
function Suspended(props: { readonly children: ReactNode }) {
  return (
    <Suspense fallback={<p className="p-6 text-[13px] text-muted-foreground">{m.loading()}</p>}>
      {props.children}
    </Suspense>
  );
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: function RootLayout() {
    const { api, session } = rootRoute.useRouteContext();
    return (
      <ClientsProvider api={api} session={session}>
        <Outlet />
      </ClientsProvider>
    );
  },
  pendingComponent: function Pending() {
    return <p className="p-6 text-[13px] text-muted-foreground">{m.loading()}</p>;
  },
  errorComponent: function Failed({ error }) {
    const text = error instanceof ApiProblem ? error.message : m.unexpected();
    return (
      <p role="alert" className="p-6 text-[13px] text-destructive">
        {text}
      </p>
    );
  },
  notFoundComponent: function Missing() {
    return <p className="p-6 text-[13px] text-muted-foreground">{m.unexpected()}</p>;
  },
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/accesso',
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.query({ ...meQuery(context.api), staleTime: 'static' });
    if (me !== null) {
      throw redirect({ to: '/', replace: true });
    }
  },
  component: function LoginFrame() {
    return (
      <Suspended>
        <LoginPage />
      </Suspended>
    );
  },
});

const signupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/registrazione',
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.query({ ...meQuery(context.api), staleTime: 'static' });
    if (me !== null) {
      throw redirect({ to: '/', replace: true });
    }
  },
  component: function SignupFrame() {
    return (
      <Suspended>
        <SignupPage />
      </Suspended>
    );
  },
});

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'authenticated',
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.query({ ...meQuery(context.api), staleTime: 'static' });
    if (me === null) {
      throw redirect({ to: '/accesso', replace: true });
    }
    return { me };
  },
  component: () => <Outlet />,
});

const entryRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  beforeLoad: async ({ context }) => {
    const familyId = pickFamilyId(context.me);
    if (familyId === null) {
      throw redirect({ to: '/famiglia/nuova', replace: true });
    }
    const houses = await context.queryClient.query({
      ...housesQuery(context.api, familyId),
      staleTime: 'static',
    });
    const houseId = pickHouseId(context.me, familyId, houses);
    if (houseId === null) {
      throw redirect({ to: '/famiglia/nuova', replace: true });
    }
    throw redirect({ to: '/f/$familyId/c/$houseId', params: { familyId, houseId }, replace: true });
  },
});

const createFamilyRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/famiglia/nuova',
  component: function CreateFamilyFrame() {
    const { me } = createFamilyRoute.useRouteContext();
    return (
      <Suspended>
        <CreateFamilyPage me={me} />
      </Suspended>
    );
  },
});

const houseRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/f/$familyId/c/$houseId',
  beforeLoad: async ({ context, params }) => {
    if (!context.me.families.some((family) => family.id === params.familyId)) {
      throw redirect({ to: '/', replace: true });
    }
    const houses = await context.queryClient.query({
      ...housesQuery(context.api, params.familyId),
      staleTime: 'static',
    });
    if (!houses.some((house) => house.id === params.houseId)) {
      const fallback = pickHouseId(context.me, params.familyId, houses);
      if (fallback === null) {
        throw redirect({ to: '/famiglia/nuova', replace: true });
      }
      throw redirect({
        to: '/f/$familyId/c/$houseId',
        params: { familyId: params.familyId, houseId: fallback },
        replace: true,
      });
    }
    return { houses };
  },
  component: function HouseFrame() {
    const { me, houses } = houseRoute.useRouteContext();
    const { familyId, houseId } = houseRoute.useParams();
    useEffect(() => {
      applyTheme(me.theme);
    }, [me.theme]);
    return (
      <AppShell me={me} familyId={familyId} houseId={houseId} houses={houses}>
        <Outlet />
      </AppShell>
    );
  },
});

const homeRoute = createRoute({
  getParentRoute: () => houseRoute,
  path: '/',
  component: function HomeFrame() {
    const { me, houses } = houseRoute.useRouteContext();
    const { familyId, houseId } = houseRoute.useParams();
    const house = houses.find((item: House) => item.id === houseId);
    const familyName =
      me.families.find((family: Me['families'][number]) => family.id === familyId)?.name ?? '';
    if (house === undefined) {
      return <p className="text-[13px] text-muted-foreground">{m.noHouses()}</p>;
    }
    return (
      <Suspended>
        <HomePage me={me} house={house} familyName={familyName} />
      </Suspended>
    );
  },
});

const vaultRoute = createRoute({
  getParentRoute: () => houseRoute,
  path: '/cassaforte',
  component: function VaultFrame() {
    return (
      <Suspended>
        <VaultPage />
      </Suspended>
    );
  },
});
const familySectionRoute = createRoute({
  getParentRoute: () => houseRoute,
  path: '/famiglia',
  component: function FamilyFrame() {
    const { me } = houseRoute.useRouteContext();
    const { familyId } = houseRoute.useParams();
    return (
      <Suspended>
        <FamilyPage me={me} familyId={familyId} />
      </Suspended>
    );
  },
});
const casaRoute = createRoute({
  getParentRoute: () => houseRoute,
  path: '/casa',
  component: function CasaFrame() {
    const { me, houses } = houseRoute.useRouteContext();
    const { familyId, houseId } = houseRoute.useParams();
    return (
      <Suspended>
        <HousePage me={me} familyId={familyId} houseId={houseId} houses={houses} />
      </Suspended>
    );
  },
});
const personalRoute = createRoute({
  getParentRoute: () => houseRoute,
  path: '/personale',
  component: function PersonalFrame() {
    return (
      <Suspended>
        <PersonalPage />
      </Suspended>
    );
  },
});
const printRoute = createRoute({
  getParentRoute: () => houseRoute,
  path: '/stampa',
  component: function PrintFrame() {
    return (
      <Suspended>
        <PrintPage />
      </Suspended>
    );
  },
});
const extraRoute = createRoute({
  getParentRoute: () => houseRoute,
  path: '/extra',
  component: function ExtraFrame() {
    return (
      <Suspended>
        <ExtraPage />
      </Suspended>
    );
  },
});
const guideRoute = createRoute({
  getParentRoute: () => houseRoute,
  path: '/guida',
  component: function GuideFrame() {
    return (
      <Suspended>
        <GuidePage />
      </Suspended>
    );
  },
});
const accountRoute = createRoute({
  getParentRoute: () => houseRoute,
  path: '/account',
  component: function AccountFrame() {
    const { me } = houseRoute.useRouteContext();
    return (
      <Suspended>
        <AccountPage me={me} />
      </Suspended>
    );
  },
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  signupRoute,
  appRoute.addChildren([
    entryRoute,
    createFamilyRoute,
    houseRoute.addChildren([
      homeRoute,
      vaultRoute,
      familySectionRoute,
      casaRoute,
      personalRoute,
      printRoute,
      extraRoute,
      guideRoute,
      accountRoute,
    ]),
  ]),
]);

/**
 * Builds the application router.
 *
 * Preconditions: `context.api` and `context.session` share an origin.
 * Postconditions: signed-out visits to a house route go to sign-in; an account without a family goes to creation.
 * Data contract: family and house ids stay in the path.
 *
 * @param context - Query cache, API and auth client.
 * @param history - Optional history, used by tests.
 * @returns The router.
 */
export function createAppRouter(
  context: RouterContext,
  history?: NonNullable<Parameters<typeof createRouter>[0]['history']>,
) {
  return createRouter({
    routeTree,
    context,
    defaultPreload: 'intent',
    defaultPendingMs: 250,
    ...(history === undefined ? {} : { history }),
  });
}
