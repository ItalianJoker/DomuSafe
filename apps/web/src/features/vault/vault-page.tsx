import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Me } from '@domusafe/contracts';
import { can, type FamilyVaultSection, type VaultPayload } from '@domusafe/contracts';
import type { Bytes } from '@domusafe/crypto';
import { fromBase64Url } from '@domusafe/crypto';
import { hasFeature, type PlanTier } from '@domusafe/plans';
import { useApi } from '@/components/api-context.js';
import { Field, PageHeader } from '@/components/shell/page.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Textarea } from '@/components/ui/textarea.js';
import { m } from '@/paraglide/messages.js';
import {
  clearVaultMemory,
  draftAccount,
  loadLocalAccountKey,
  lockVault,
  pairWithPhrase,
  phraseChecks,
  phraseMatches,
  publishAccount,
  readDocuments,
  removeDocument,
  resetWithPhrase,
  saveDocument,
  setFirstCode,
  unlockWithCode,
  type AccountDraft,
  type OpenDocument,
} from './crypto-flow.js';
import { browserDeviceStore } from './device-store.js';
import { SectionEditor } from './editor.js';
import { codeProblem, sectionLabel, VAULT_SECTIONS, vaultProblemText } from './model.js';

type Stage =
  | { readonly name: 'loading' }
  | { readonly name: 'intro' }
  | {
      readonly name: 'phrase';
      readonly draft: AccountDraft;
      readonly checks: readonly [number, number, number];
    }
  | { readonly name: 'pair' }
  | { readonly name: 'create' }
  | { readonly name: 'unlock' }
  | { readonly name: 'reset' }
  | { readonly name: 'open' };

const IDLE_MS = 5 * 60 * 1000;

function stageForPin(state: 'not_set' | 'active' | 'locked'): Stage {
  if (state === 'not_set') {
    return { name: 'create' };
  }
  if (state === 'locked') {
    return { name: 'reset' };
  }
  return { name: 'unlock' };
}

/**
 * Cassaforte of the open family. Documents are encrypted in the browser before they are saved.
 *
 * Preconditions: `familyId` is one of the account's families.
 * Postconditions: Free and Basic see the locked explanation. A wrong code shows a sentence and stays on the form.
 * Data contract: the server receives envelopes only. The recovery phrase is shown once and is not stored.
 *
 * @param props - Account and the open family.
 * @returns The section.
 */
export function VaultPage(props: { readonly me: Me; readonly familyId: string }) {
  const api = useApi();
  const family = props.me.families.find((item) => item.id === props.familyId);
  const plan: PlanTier = family?.plan ?? 'free';
  const role = family?.role;
  const allowed =
    role !== undefined &&
    can({ role, isOwner: false, vaultFamilyConcession: family?.vaultFamily ?? false }, 'vault.family.read');
  const canWrite =
    role !== undefined &&
    can({ role, isOwner: false, vaultFamilyConcession: family?.vaultFamily ?? false }, 'vault.family.write');
  const store = useMemo(() => browserDeviceStore(), []);
  const accountKey = useRef<Bytes | null>(null);
  const recoveryPublicKey = useRef<Bytes | null>(null);
  const [stage, setStage] = useState<Stage>({ name: 'loading' });
  const [section, setSection] = useState<FamilyVaultSection>('family_accounts');
  const [documents, setDocuments] = useState<readonly OpenDocument[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [repeat, setRepeat] = useState('');
  const [phrase, setPhrase] = useState('');
  const [answers, setAnswers] = useState(['', '', '']);

  const fail = useCallback((caught: unknown) => {
    setError(vaultProblemText(caught));
    setBusy(false);
  }, []);

  const closeVault = useCallback(() => {
    accountKey.current = null;
    clearVaultMemory();
    setDocuments([]);
    setStage({ name: 'unlock' });
    void lockVault(api).catch(() => undefined);
  }, [api]);

  useEffect(() => {
    if (!hasFeature(plan, 'vault_family') || !allowed) {
      return;
    }
    const gate = { current: true };
    const closed = (): boolean => !gate.current;
    void (async () => {
      try {
        const keys = await api.getKeys();
        if (closed()) {
          return;
        }
        if (keys.state === 'missing') {
          setStage({ name: 'intro' });
          return;
        }
        recoveryPublicKey.current = fromBase64Url(keys.recoveryPublicKey);
        const local = await loadLocalAccountKey(api, store, props.me.accountId);
        if (closed()) {
          return;
        }
        if (local === null) {
          setStage({ name: 'pair' });
          return;
        }
        accountKey.current = local;
        const pin = await api.getVaultPin();
        if (closed()) {
          return;
        }
        setStage(stageForPin(pin.state));
      } catch (caught) {
        if (!closed()) {
          fail(caught);
          setStage({ name: 'intro' });
        }
      }
    })();
    return () => {
      gate.current = false;
    };
  }, [allowed, api, fail, plan, props.me.accountId, store]);

  useEffect(() => {
    if (stage.name !== 'open') {
      return;
    }
    let timer = window.setTimeout(() => closeVault(), IDLE_MS);
    const bump = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => closeVault(), IDLE_MS);
    };
    const onHide = () => {
      if (document.visibilityState === 'hidden') {
        closeVault();
      }
    };
    window.addEventListener('pointerdown', bump);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointerdown', bump);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [closeVault, stage.name]);

  useEffect(() => {
    if (stage.name !== 'open') {
      return;
    }
    const gate = { current: true };
    void (async () => {
      try {
        const rows = await readDocuments(api, props.familyId, section);
        if (gate.current) {
          setDocuments(rows);
        }
      } catch (caught) {
        if (gate.current) {
          fail(caught);
        }
      }
    })();
    return () => {
      gate.current = false;
    };
  }, [api, fail, props.familyId, section, stage.name]);

  if (!hasFeature(plan, 'vault_family')) {
    return (
      <section>
        <PageHeader title={m.vaultTitle()} lead={m.vaultBody()} />
        <p className="max-w-xl text-[13px] leading-relaxed text-muted-foreground">{m.vaultPlanLocked()}</p>
      </section>
    );
  }
  if (!allowed) {
    return (
      <section>
        <PageHeader title={m.vaultTitle()} lead={m.vaultBody()} />
        <p className="max-w-xl text-[13px] text-muted-foreground">{m.vaultHidden()}</p>
      </section>
    );
  }

  async function beginPhrase(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const created = await draftAccount(props.me.accountId);
      setAnswers(['', '', '']);
      setStage({ name: 'phrase', draft: created, checks: phraseChecks() });
    } catch (caught) {
      fail(caught);
    } finally {
      setBusy(false);
    }
  }

  async function confirmPhrase(current: Extract<Stage, { name: 'phrase' }>): Promise<void> {
    const words = current.draft.secrets.recoveryPhrase.split(' ');
    if (!phraseMatches(words, current.checks, answers)) {
      setError(m.vaultPhraseMismatch());
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await publishAccount(api, store, props.me.accountId, current.draft, m.vaultDeviceLabel());
      accountKey.current = current.draft.secrets.accountKey;
      recoveryPublicKey.current = current.draft.bundle.recoveryPublicKey;
      setStage({ name: 'create' });
    } catch (caught) {
      fail(caught);
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(mode: 'create' | 'unlock' | 'reset' | 'pair'): Promise<void> {
    const problem = codeProblem(code);
    if (problem !== null && mode !== 'pair') {
      setError(problem);
      return;
    }
    if ((mode === 'create' || mode === 'reset') && code !== repeat) {
      setError(m.vaultCodeMismatch());
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (mode === 'pair') {
        accountKey.current = await pairWithPhrase(
          api,
          store,
          props.me.accountId,
          phrase,
          m.vaultDeviceLabel(),
        );
        const pin = await api.getVaultPin();
        setPhrase('');
        setStage(stageForPin(pin.state));
        return;
      }
      const key = accountKey.current;
      if (key === null) {
        setStage({ name: 'pair' });
        return;
      }
      if (mode === 'create') {
        const publicKey = recoveryPublicKey.current;
        if (publicKey === null) {
          throw new Error('recovery key missing');
        }
        await setFirstCode(api, props.me.accountId, key, code, publicKey);
        setStage({ name: 'unlock' });
      }
      if (mode === 'reset') {
        await resetWithPhrase(
          api,
          store,
          props.familyId,
          props.me.accountId,
          phrase,
          code,
          m.vaultDeviceLabel(),
        );
        setCode('');
        setRepeat('');
        setPhrase('');
        setStage({ name: 'open' });
        return;
      }
      await unlockWithCode(api, props.familyId, props.me.accountId, key, code);
      setCode('');
      setStage({ name: 'open' });
    } catch (caught) {
      fail(caught);
      if (vaultProblemText(caught) === m.vaultCodeLocked()) {
        setStage({ name: 'reset' });
      }
    } finally {
      setBusy(false);
    }
  }

  async function save(payload: VaultPayload, existing?: { id: string; version: number }): Promise<void> {
    if (!canWrite) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await saveDocument(api, props.familyId, section, payload, existing);
      setDocuments(await readDocuments(api, props.familyId, section));
    } catch (caught) {
      fail(caught);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string, version: number): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await removeDocument(api, props.familyId, id, version);
      setDocuments(await readDocuments(api, props.familyId, section));
    } catch (caught) {
      fail(caught);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6">
      <PageHeader title={m.vaultTitle()} lead={m.vaultLead()} />
      {stage.name === 'loading' ? (
        <p className="text-[13px] text-muted-foreground">{m.vaultWorking()}</p>
      ) : null}
      {stage.name === 'intro' ? (
        <div className="grid max-w-xl gap-3">
          <p className="text-[13px] leading-relaxed text-muted-foreground">{m.vaultPhraseLead()}</p>
          {error === null ? null : <p className="text-[13px] text-destructive">{error}</p>}
          <Button type="button" className="min-h-12 w-fit" disabled={busy} onClick={() => void beginPhrase()}>
            {busy ? m.vaultWorking() : m.vaultPrepare()}
          </Button>
        </div>
      ) : null}
      {stage.name === 'phrase' ? (
        <form
          className="grid max-w-xl gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void confirmPhrase(stage);
          }}
        >
          <p className="text-[13px] leading-relaxed text-muted-foreground">{m.vaultPhraseLead()}</p>
          <ol className="grid grid-cols-3 gap-x-4 gap-y-1 text-[13px]">
            {stage.draft.secrets.recoveryPhrase.split(' ').map((word, index) => (
              <li key={word + String(index)}>
                <span className="text-muted-foreground">{index + 1}. </span>
                {word}
              </li>
            ))}
          </ol>
          {stage.checks.map((position, index) => (
            <Field
              key={position}
              label={m.vaultPhraseWord({ number: String(position + 1) })}
              htmlFor={`word-${String(position)}`}
            >
              <Input
                id={`word-${String(position)}`}
                autoComplete="off"
                spellCheck={false}
                value={answers[index] ?? ''}
                onChange={(event) => {
                  const next = [...answers];
                  next[index] = event.target.value;
                  setAnswers(next);
                }}
              />
            </Field>
          ))}
          {error === null ? null : <p className="text-[13px] text-destructive">{error}</p>}
          <Button type="submit" className="min-h-12 w-fit" disabled={busy}>
            {m.vaultPhraseConfirm()}
          </Button>
        </form>
      ) : null}
      {stage.name === 'pair' ||
      stage.name === 'unlock' ||
      stage.name === 'create' ||
      stage.name === 'reset' ? (
        <CodeForm
          mode={stage.name}
          code={code}
          repeat={repeat}
          phrase={phrase}
          busy={busy}
          error={error}
          onCode={setCode}
          onRepeat={setRepeat}
          onPhrase={setPhrase}
          onForgot={() => {
            setError(null);
            setStage({ name: 'reset' });
          }}
          onBack={() => {
            setError(null);
            setStage({ name: 'unlock' });
          }}
          onSubmit={() => void submitCode(stage.name)}
        />
      ) : null}
      {stage.name === 'open' ? (
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1 border-b border-border" role="tablist">
              {VAULT_SECTIONS.map((item) => (
                <button
                  key={item}
                  type="button"
                  role="tab"
                  aria-selected={item === section}
                  className={
                    item === section
                      ? 'h-8 border-b-2 border-foreground px-2 text-[13px]'
                      : 'h-8 px-2 text-[13px] text-muted-foreground'
                  }
                  onClick={() => setSection(item)}
                >
                  {sectionLabel(item)}
                </button>
              ))}
            </div>
            <Button type="button" variant="outline" className="min-h-12" onClick={closeVault}>
              {m.vaultLock()}
            </Button>
          </div>
          {canWrite ? (
            <SectionEditor
              section={section}
              documents={documents}
              busy={busy}
              error={error}
              onSave={(payload, existing) => void save(payload, existing)}
              onRemove={(id, version) => void remove(id, version)}
            />
          ) : (
            <p className="text-[13px] text-muted-foreground">{m.vaultHidden()}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function CodeForm(props: {
  readonly mode: 'pair' | 'unlock' | 'create' | 'reset';
  readonly code: string;
  readonly repeat: string;
  readonly phrase: string;
  readonly busy: boolean;
  readonly error: string | null;
  readonly onCode: (value: string) => void;
  readonly onRepeat: (value: string) => void;
  readonly onPhrase: (value: string) => void;
  readonly onForgot: () => void;
  readonly onBack: () => void;
  readonly onSubmit: () => void;
}) {
  const needsPhrase = props.mode === 'pair' || props.mode === 'reset';
  const needsRepeat = props.mode === 'create' || props.mode === 'reset';
  const label =
    props.mode === 'pair'
      ? m.vaultPairSubmit()
      : props.mode === 'reset'
        ? m.vaultResetSubmit()
        : props.mode === 'create'
          ? m.vaultSave()
          : props.busy
            ? m.vaultUnlocking()
            : m.vaultUnlock();
  return (
    <form
      className="grid max-w-xl gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        props.onSubmit();
      }}
    >
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        {props.mode === 'pair'
          ? m.vaultPairLead()
          : props.mode === 'reset'
            ? m.vaultResetLead()
            : m.vaultCodeHint()}
      </p>
      {needsPhrase ? (
        <Field label={m.vaultPairSubmit()} htmlFor="vault-phrase">
          <Textarea
            id="vault-phrase"
            autoComplete="off"
            spellCheck={false}
            value={props.phrase}
            onChange={(event) => props.onPhrase(event.target.value)}
          />
        </Field>
      ) : null}
      {props.mode === 'pair' ? null : (
        <Field label={props.mode === 'reset' ? m.vaultNewCode() : m.vaultCodeLabel()} htmlFor="vault-code">
          <Input
            id="vault-code"
            type="password"
            autoComplete="off"
            value={props.code}
            onChange={(event) => props.onCode(event.target.value)}
          />
        </Field>
      )}
      {needsRepeat ? (
        <Field label={m.vaultCodeRepeat()} htmlFor="vault-code-repeat">
          <Input
            id="vault-code-repeat"
            type="password"
            autoComplete="off"
            value={props.repeat}
            onChange={(event) => props.onRepeat(event.target.value)}
          />
        </Field>
      ) : null}
      {props.error === null ? null : (
        <p role="alert" className="text-[13px] text-destructive">
          {props.error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="min-h-12" disabled={props.busy}>
          {props.busy && props.mode !== 'unlock' ? m.vaultWorking() : label}
        </Button>
        {props.mode === 'unlock' ? (
          <Button type="button" variant="ghost" className="min-h-12" onClick={props.onForgot}>
            {m.vaultForgot()}
          </Button>
        ) : null}
        {props.mode === 'reset' ? (
          <Button type="button" variant="ghost" onClick={props.onBack}>
            {m.vaultBack()}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
