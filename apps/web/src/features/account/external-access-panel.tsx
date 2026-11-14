import { useEffect, useState } from 'react';
import type { AuthProvider } from '@domusafe/contracts';
import { useApi, useSession } from '@/components/api-context.js';
import { Button } from '@/components/ui/button.js';
import { providerButtonLabel } from '@/features/access/external-access.js';
import { authFailureText } from '@/lib/copy.js';
import type { LinkedAccount } from '@/lib/session.js';
import { m } from '@/paraglide/messages.js';

/**
 * Account panel: shows linked external providers and offers linking when configured.
 *
 * Preconditions: the account is signed in; this chunk is loaded lazily from Account.
 * Postconditions: linking leaves the page for the identity provider and returns to Account.
 * Loaded separately so the shell gzip budget stays intact.
 *
 * @returns The panel, or null when no external providers are configured and none are linked.
 */
export function ExternalAccessPanel() {
  const api = useApi();
  const session = useSession();
  const [providers, setProviders] = useState<AuthProvider[]>([]);
  const [linked, setLinked] = useState<LinkedAccount[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const state = { cancelled: false };
    void (async () => {
      try {
        const [available, accounts] = await Promise.all([
          api.listAuthProviders(),
          session.listLinkedAccounts(),
        ]);
        if (state.cancelled) {
          return;
        }
        setProviders(available.providers);
        setLinked(accounts.filter((account) => account.providerId !== 'credential'));
      } catch {
        if (!state.cancelled) {
          setProviders([]);
          setLinked([]);
        }
      } finally {
        if (!state.cancelled) {
          setReady(true);
        }
      }
    })();
    return () => {
      state.cancelled = true;
    };
  }, [api, session]);

  if (!ready) {
    return <p className="text-[13px] text-muted-foreground">{m.loading()}</p>;
  }

  const linkedIds = new Set(linked.map((account) => account.providerId));
  const linkable = providers.filter((provider) => !linkedIds.has(provider.id));
  if (providers.length === 0 && linked.length === 0) {
    return null;
  }

  async function link(provider: AuthProvider): Promise<void> {
    setPendingId(provider.id);
    setError(null);
    try {
      const callbackURL = `${window.location.pathname}${window.location.search}`;
      const result = await session.linkProvider(provider.id, callbackURL);
      if (result.status === 'error') {
        setError(authFailureText(result.reason));
        return;
      }
      window.location.assign(result.url);
    } catch {
      setError(m.network());
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="grid gap-3">
      <div>
        <h2 className="text-[15px] font-medium tracking-tight">{m.externalAccessTitle()}</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">{m.externalAccessAccountLead()}</p>
      </div>
      {linked.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">{m.externalAccessNoneLinked()}</p>
      ) : (
        <ul className="grid gap-1.5 text-[13px]">
          {linked.map((account) => {
            const known = providers.find((provider) => provider.id === account.providerId);
            const label =
              known === undefined
                ? account.providerId === 'google'
                  ? m.externalAccessGoogleLinked()
                  : m.externalAccessOpenIdLinked()
                : known.kind === 'google'
                  ? m.externalAccessGoogleLinked()
                  : m.externalAccessOpenIdLinked();
            return (
              <li key={account.id} className="text-muted-foreground">
                {label}
              </li>
            );
          })}
        </ul>
      )}
      {linkable.length === 0 ? null : (
        <div className="grid gap-2">
          {linkable.map((provider) => (
            <Button
              key={provider.id}
              type="button"
              variant="outline"
              disabled={pendingId !== null}
              onClick={() => void link(provider)}
            >
              {providerButtonLabel(provider)}
            </Button>
          ))}
        </div>
      )}
      {error === null ? null : (
        <p role="alert" className="text-[12px] text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
