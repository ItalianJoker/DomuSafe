import { useEffect, useState } from 'react';
import type { AuthProvider } from '@domusafe/contracts';
import { useApi, useSession } from '@/components/api-context.js';
import { Button } from '@/components/ui/button.js';
import { authFailureText } from '@/lib/copy.js';
import { m } from '@/paraglide/messages.js';

/**
 * Label of an external provider button without acronyms in the interface.
 *
 * @param provider - Configured provider.
 * @returns Italian or English copy from Paraglide.
 */
export function providerButtonLabel(provider: AuthProvider): string {
  return provider.kind === 'google' ? m.externalAccessGoogle() : m.externalAccessOpenId();
}

/**
 * Starts the Better Auth redirect for sign-in or account linking.
 *
 * Preconditions: the provider id is listed by `GET /api/v1/auth/providers`.
 * Postconditions: the browser leaves the page when the authorize URL is returned.
 *
 * @param props - Mode, optional className, and how to surface errors.
 * @returns Buttons for every configured provider, or null when none are configured.
 */
export function ExternalAccessButtons(props: {
  readonly mode: 'sign-in' | 'link';
  readonly callbackURL: string;
  readonly onError: (message: string) => void;
  readonly className?: string;
}) {
  const api = useApi();
  const session = useSession();
  const [providers, setProviders] = useState<AuthProvider[] | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    const state = { cancelled: false };
    void api
      .listAuthProviders()
      .then((result) => {
        if (!state.cancelled) {
          setProviders(result.providers);
        }
      })
      .catch(() => {
        if (!state.cancelled) {
          setProviders([]);
        }
      });
    return () => {
      state.cancelled = true;
    };
  }, [api]);

  if (providers === null || providers.length === 0) {
    return null;
  }

  async function start(provider: AuthProvider): Promise<void> {
    setPendingId(provider.id);
    props.onError('');
    try {
      const result =
        props.mode === 'sign-in'
          ? await session.signInWithProvider(provider.id, props.callbackURL)
          : await session.linkProvider(provider.id, props.callbackURL);
      if (result.status === 'error') {
        props.onError(authFailureText(result.reason));
        return;
      }
      window.location.assign(result.url);
    } catch {
      props.onError(m.network());
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className={props.className ?? 'grid gap-2'}>
      <p className="text-[12px] text-muted-foreground">{m.externalAccessLead()}</p>
      {providers.map((provider) => (
        <Button
          key={provider.id}
          type="button"
          variant="outline"
          disabled={pendingId !== null}
          onClick={() => void start(provider)}
        >
          {providerButtonLabel(provider)}
        </Button>
      ))}
    </div>
  );
}
