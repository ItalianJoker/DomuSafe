import { Link, useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode, type SubmitEvent } from 'react';
import { useSession } from '@/components/api-context.js';
import { Brand, Field } from '@/components/shell/page.js';
import { ThemeControl } from '@/components/shell/theme-control.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { authFailureText, issueText } from '@/lib/copy.js';
import { validateSignIn, validateSignUp, type FieldIssues } from '@/lib/fields.js';
import { meKey } from '@/lib/queries.js';
import { applyTheme, readStoredTheme, type ThemePreference } from '@/lib/theme.js';
import { m } from '@/paraglide/messages.js';

/**
 * Centers an access form on the same tokens as the signed-in shell.
 *
 * @param props - Title, lead and form.
 * @returns The screen.
 */
function AccessFrame(props: { readonly title: string; readonly lead: string; readonly children: ReactNode }) {
  const [theme, setTheme] = useState<ThemePreference>(() => readStoredTheme());
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-[360px]">
        <Brand />
        <h1 className="mt-8 text-[20px] font-medium tracking-tight">{props.title}</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">{props.lead}</p>
        <div className="mt-6">{props.children}</div>
        <div className="mt-8">
          <ThemeControl
            value={theme}
            onChange={(next) => {
              setTheme(next);
              applyTheme(next);
            }}
          />
        </div>
      </div>
    </div>
  );
}

function issuesOf(issues: FieldIssues | null, field: string): string | undefined {
  const issue = issues?.[field];
  return issue === undefined ? undefined : issueText(issue);
}

/**
 * Email and password sign-in, including the second verification step.
 *
 * Preconditions: the session client points at `/api/auth`.
 * Postconditions: a session navigates to the entry route, which opens the last house.
 *
 * @returns The sign-in screen.
 */
export function LoginPage() {
  const session = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'password' | 'code'>('password');
  const [issues, setIssues] = useState<FieldIssues | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function enter(): Promise<void> {
    await queryClient.invalidateQueries({ queryKey: meKey });
    await navigate({ to: '/' });
  }

  async function onPassword(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const next = validateSignIn({ email, password });
    setIssues(next);
    if (next !== null) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await session.signIn(email.trim(), password);
      if (result.status === 'signed-in') {
        await enter();
        return;
      }
      if (result.status === 'two-factor') {
        setStep('code');
        return;
      }
      setError(authFailureText(result.reason));
    } catch {
      setError(m.network());
    } finally {
      setPending(false);
    }
  }

  async function onCode(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (code.trim().length === 0) {
      setError(m.fieldRequired());
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await session.verifyCode(code.trim());
      if (result.status === 'signed-in') {
        await enter();
        return;
      }
      if (result.status === 'error') {
        setError(authFailureText(result.reason === 'credentials' ? 'code' : result.reason));
      }
    } catch {
      setError(m.network());
    } finally {
      setPending(false);
    }
  }

  return (
    <AccessFrame
      title={step === 'code' ? m.twoFactorTitle() : m.loginTitle()}
      lead={step === 'code' ? m.twoFactorLead() : m.loginLead()}
    >
      {step === 'password' ? (
        <form className="grid gap-3" onSubmit={(event) => void onPassword(event)}>
          <Field htmlFor="email" label={m.emailLabel()} {...note(issuesOf(issues, 'email'))}>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          <Field htmlFor="password" label={m.passwordLabel()} {...note(issuesOf(issues, 'password'))}>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
          {error === null ? null : (
            <p role="alert" className="text-[12px] text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={pending}>
            {m.loginSubmit()}
          </Button>
          <Link
            to="/registrazione"
            className="text-[13px] text-muted-foreground underline-offset-4 hover:underline"
          >
            {m.goToSignup()}
          </Link>
        </form>
      ) : (
        <form className="grid gap-3" onSubmit={(event) => void onCode(event)}>
          <Field htmlFor="code" label={m.twoFactorLabel()}>
            <Input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </Field>
          {error === null ? null : (
            <p role="alert" className="text-[12px] text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={pending}>
            {m.twoFactorSubmit()}
          </Button>
        </form>
      )}
    </AccessFrame>
  );
}

/**
 * Account creation. The password is chosen and typed by the person.
 *
 * Preconditions: the session client points at `/api/auth`.
 * Postconditions: a new session continues to family creation.
 *
 * @returns The sign-up screen.
 */
export function SignupPage() {
  const session = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [issues, setIssues] = useState<FieldIssues | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const next = validateSignUp({ name, email, password, confirm });
    setIssues(next);
    if (next !== null) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await session.signUp(name.trim(), email.trim(), password);
      if (result.status === 'error') {
        setError(authFailureText(result.reason));
        return;
      }
      await queryClient.invalidateQueries({ queryKey: meKey });
      await navigate({ to: '/famiglia/nuova' });
    } catch {
      setError(m.network());
    } finally {
      setPending(false);
    }
  }

  return (
    <AccessFrame title={m.signupTitle()} lead={m.signupLead()}>
      <form className="grid gap-3" onSubmit={(event) => void onSubmit(event)}>
        <Field htmlFor="name" label={m.displayNameLabel()} {...note(issuesOf(issues, 'name'))}>
          <Input
            id="name"
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field htmlFor="email" label={m.emailLabel()} {...note(issuesOf(issues, 'email'))}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
        <Field htmlFor="password" label={m.passwordLabel()} {...note(issuesOf(issues, 'password'))}>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
        <Field htmlFor="confirm" label={m.passwordConfirmLabel()} {...note(issuesOf(issues, 'confirm'))}>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </Field>
        {error === null ? null : (
          <p role="alert" className="text-[12px] text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" disabled={pending}>
          {m.signupSubmit()}
        </Button>
        <Link to="/accesso" className="text-[13px] text-muted-foreground underline-offset-4 hover:underline">
          {m.goToLogin()}
        </Link>
      </form>
    </AccessFrame>
  );
}

function note(error: string | undefined): { error: string } | Record<string, never> {
  return error === undefined ? {} : { error };
}
