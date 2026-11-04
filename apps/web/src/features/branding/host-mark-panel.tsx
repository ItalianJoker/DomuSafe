import { useQuery, useQueryClient } from '@tanstack/react-query';
import { hasFeature, type PlanTier } from '@domusafe/plans';
import { useState } from 'react';
import type { FamilyBranding, Me } from '@domusafe/contracts';
import { useApi } from '@/components/api-context.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Label } from '@/components/ui/label.js';
import { Textarea } from '@/components/ui/textarea.js';
import { problemText } from '@/lib/copy.js';
import { brandingQuery } from '@/lib/queries.js';
import { m } from '@/paraglide/messages.js';
import { compressLogo } from './logo.js';

/**
 * Host mark editor on the account page.
 *
 * Preconditions: the signed-in person is the administrator of `familyId`.
 * Postconditions: a plan without branding explains the limit and does not call the API.
 * Data contract: name, one color, welcome sentence and a small logo. No vault fields.
 *
 * @param props - Account, family and effective plan.
 * @returns The editor, or the explanation.
 */
export function HostMarkPanel(props: {
  readonly me: Me;
  readonly familyId: string;
  readonly tier: PlanTier;
}) {
  const api = useApi();
  const allowed = hasFeature(props.tier, 'branding');
  const query = useQuery({
    ...brandingQuery(api, props.familyId),
    enabled: allowed,
  });
  if (!allowed) {
    return (
      <section className="grid gap-2">
        <h2 className="text-[13px] font-medium">{m.hostMarkTitle()}</h2>
        <p className="text-[13px] leading-relaxed text-muted-foreground">{m.hostMarkPlan()}</p>
        <p className="text-[13px] leading-relaxed text-muted-foreground">{m.hostMarkFree()}</p>
        <p className="text-[13px] leading-relaxed text-muted-foreground">{m.hostMarkAdvanced()}</p>
      </section>
    );
  }
  if (query.isError) {
    return (
      <p role="alert" className="text-[13px] text-destructive">
        {problemText(query.error)}
      </p>
    );
  }
  if (query.isPending) {
    return <p className="text-[13px] text-muted-foreground">{m.loading()}</p>;
  }
  return (
    <HostForm
      key={query.data?.version ?? 'empty'}
      me={props.me}
      familyId={props.familyId}
      branding={query.data}
    />
  );
}

function HostForm(props: {
  readonly me: Me;
  readonly familyId: string;
  readonly branding: FamilyBranding | null;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const stored = props.branding;
  const [name, setName] = useState(stored?.displayName ?? '');
  const [color, setColor] = useState(stored?.color ?? '');
  const [welcome, setWelcome] = useState(stored?.welcome ?? '');
  const [logo, setLogo] = useState<string | null>(stored?.logoDataUrl ?? null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  async function onLogo(file: File | undefined): Promise<void> {
    if (file === undefined) {
      return;
    }
    const next = await compressLogo(file);
    if (next === null) {
      setError(m.hostLogoTooBig());
      return;
    }
    setError(null);
    setLogo(next);
  }

  async function save(clear: boolean): Promise<void> {
    const trimmedName = name.trim();
    const trimmedWelcome = welcome.trim();
    if (!clear && trimmedName.length > 80) {
      setError(m.hostNameLong());
      return;
    }
    if (!clear && trimmedWelcome.length > 160) {
      setError(m.hostWelcomeLong());
      return;
    }
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      const branding = await api.putBranding(
        props.familyId,
        stored?.version ?? null,
        clear
          ? { displayName: null, color: null, welcome: null, logoDataUrl: null }
          : {
              displayName: trimmedName === '' ? null : trimmedName,
              color: color === '' ? null : color,
              welcome: trimmedWelcome === '' ? null : trimmedWelcome,
              logoDataUrl: logo,
            },
        crypto.randomUUID(),
      );
      queryClient.setQueryData(brandingQuery(api, props.familyId).queryKey, branding);
      setSaved(true);
    } catch (caught) {
      setError(problemText(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="grid gap-3">
      <h2 className="text-[13px] font-medium">{m.hostMarkTitle()}</h2>
      <p className="text-[13px] leading-relaxed text-muted-foreground">{m.hostMarkLead()}</p>
      <div className="grid gap-1.5">
        <Label htmlFor="host-name">{m.hostNameLabel()}</Label>
        <Input id="host-name" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="host-color">{m.hostColorLabel()}</Label>
        <div className="flex items-center gap-3">
          <input
            id="host-color"
            type="color"
            value={color === '' ? '#1f4e79' : color}
            aria-label={m.hostColorLabel()}
            className="h-8 w-12 cursor-pointer rounded-md border border-input bg-transparent"
            onChange={(event) => setColor(event.target.value)}
          />
          <Button type="button" variant="outline" onClick={() => setColor('')}>
            {m.hostColorClear()}
          </Button>
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="host-welcome">{m.hostWelcomeLabel()}</Label>
        <Textarea
          id="host-welcome"
          value={welcome}
          maxLength={160}
          onChange={(event) => setWelcome(event.target.value)}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="host-logo">{m.hostLogoLabel()}</Label>
        <p className="text-[12px] text-muted-foreground">{m.hostLogoHint()}</p>
        {logo === null ? null : <img src={logo} alt="" className="h-10 w-10 object-contain" />}
        <Input
          id="host-logo"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(event) => {
            const file = event.target.files?.[0];
            void onLogo(file);
          }}
        />
        {logo === null ? null : (
          <Button type="button" variant="outline" onClick={() => setLogo(null)}>
            {m.hostLogoClear()}
          </Button>
        )}
      </div>
      <div className="flex flex-wrap gap-3">
        <Button disabled={pending} onClick={() => void save(false)}>
          {m.save()}
        </Button>
        <Button variant="outline" disabled={pending || stored === null} onClick={() => void save(true)}>
          {m.hostClear()}
        </Button>
      </div>
      {props.me.twoFactorEnabled ? null : (
        <p className="text-[12px] text-muted-foreground">{m.hostTwoFactor()}</p>
      )}
      {error === null ? null : (
        <p role="alert" className="text-[12px] text-destructive">
          {error}
        </p>
      )}
      {saved ? <p className="text-[12px] text-muted-foreground">{m.hostSaved()}</p> : null}
    </section>
  );
}
