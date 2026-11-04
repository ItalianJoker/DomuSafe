import { useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { lazy, Suspense, useState } from 'react';
import type { Me } from '@domusafe/contracts';
import { useApi, useSession } from '@/components/api-context.js';
import { PageHeader } from '@/components/shell/page.js';
import { ThemeControl } from '@/components/shell/theme-control.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Label } from '@/components/ui/label.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { problemText } from '@/lib/copy.js';
import { meKey } from '@/lib/queries.js';
import { applyTheme, type ThemePreference } from '@/lib/theme.js';
import { m } from '@/paraglide/messages.js';
import { setLocale } from '@/paraglide/runtime.js';

const HostMarkPanel = lazy(() =>
  import('@/features/branding/host-mark-panel.js').then((mod) => ({ default: mod.HostMarkPanel })),
);

/**
 * Account section: name, language, theme, the family host mark and sign-out.
 *
 * Preconditions: `me` is the signed-in account and `familyId` is one of their families.
 * Postconditions: theme is saved on the account and painted immediately; sign-out clears the cache.
 * The host mark editor loads only for an administrator, and only after this section opens.
 *
 * @param props - Current account and the open family.
 * @returns The section.
 */
export function AccountPage(props: { readonly me: Me; readonly familyId: string }) {
  const api = useApi();
  const session = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState(props.me.displayName);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  const membership = props.me.families.find((family) => family.id === props.familyId);

  async function saveName(): Promise<void> {
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed.length > 80) {
      setError(m.nameRequired());
      return;
    }
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      const me = await api.updateProfile({ displayName: trimmed });
      queryClient.setQueryData(meKey, me);
      setSaved(true);
    } catch (caught) {
      setError(problemText(caught));
    } finally {
      setPending(false);
    }
  }

  async function saveTheme(theme: ThemePreference): Promise<void> {
    applyTheme(theme);
    try {
      const me = await api.updateProfile({ theme });
      queryClient.setQueryData(meKey, me);
    } catch (caught) {
      setError(problemText(caught));
    }
  }

  async function saveLocale(locale: 'it' | 'en'): Promise<void> {
    try {
      const me = await api.updateProfile({ locale });
      queryClient.setQueryData(meKey, me);
      await setLocale(locale, { reload: false });
    } catch (caught) {
      setError(problemText(caught));
    }
  }

  async function logout(): Promise<void> {
    await session.signOut();
    queryClient.clear();
    await navigate({ to: '/accesso' });
  }

  return (
    <section className="grid max-w-md gap-6">
      <PageHeader title={m.accountTitle()} lead={m.accountLead()} />
      <div className="grid gap-1.5">
        <Label htmlFor="account-name">{m.displayNameLabel()}</Label>
        <Input
          id="account-name"
          value={name}
          autoComplete="name"
          onChange={(event) => setName(event.target.value)}
        />
        <Button disabled={pending} onClick={() => void saveName()}>
          {m.save()}
        </Button>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="account-email">{m.emailLabel()}</Label>
        <Input id="account-email" value={props.me.email} readOnly />
        <p className="text-[12px] text-muted-foreground">{m.emailReadonly()}</p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="account-locale">{m.language()}</Label>
        <Select
          value={props.me.locale}
          onValueChange={(value) => {
            if (value === 'it' || value === 'en') {
              void saveLocale(value);
            }
          }}
        >
          <SelectTrigger id="account-locale" aria-label={m.language()}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="it">{m.languageItalian()}</SelectItem>
            <SelectItem value="en">{m.languageEnglish()}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <ThemeControl value={props.me.theme} onChange={(theme) => void saveTheme(theme)} />
      {membership?.role === 'admin' ? (
        <Suspense fallback={<p className="text-[13px] text-muted-foreground">{m.loading()}</p>}>
          <HostMarkPanel me={props.me} familyId={props.familyId} tier={membership.plan} />
        </Suspense>
      ) : null}
      {error === null ? null : (
        <p role="alert" className="text-[12px] text-destructive">
          {error}
        </p>
      )}
      {saved ? <p className="text-[12px] text-muted-foreground">{m.saved()}</p> : null}
      <Button variant="outline" onClick={() => void logout()}>
        {m.logout()}
      </Button>
    </section>
  );
}
