import { createContext, useContext, type ReactNode } from 'react';
import type { DomusafeApi } from '@/lib/api.js';
import type { SessionClient } from '@/lib/session.js';

const ApiContext = createContext<DomusafeApi | null>(null);
const SessionContext = createContext<SessionClient | null>(null);

/**
 * Provides the API and the auth client to every screen.
 *
 * Preconditions: `api` and `session` talk to the same origin.
 * Postconditions: descendants can call {@link useApi} and {@link useSession}.
 * Data contract: the instances are the ones created at startup (or by a test).
 *
 * @param props - Clients and children.
 * @returns The provider.
 */
export function ClientsProvider(props: {
  readonly api: DomusafeApi;
  readonly session: SessionClient;
  readonly children: ReactNode;
}) {
  return (
    <ApiContext.Provider value={props.api}>
      <SessionContext.Provider value={props.session}>{props.children}</SessionContext.Provider>
    </ApiContext.Provider>
  );
}

/**
 * Shell API from the nearest provider.
 *
 * Preconditions: rendered under {@link ClientsProvider}.
 * Postconditions: throws when the provider is missing.
 * @returns The API.
 */
export function useApi(): DomusafeApi {
  const api = useContext(ApiContext);
  if (api === null) {
    throw new Error('ClientsProvider is missing');
  }
  return api;
}

/**
 * Auth client from the nearest provider.
 *
 * Preconditions: rendered under {@link ClientsProvider}.
 * Postconditions: throws when the provider is missing.
 * @returns The session client.
 */
export function useSession(): SessionClient {
  const session = useContext(SessionContext);
  if (session === null) {
    throw new Error('ClientsProvider is missing');
  }
  return session;
}
