/** Why sign-in or sign-up did not finish. */
export type AuthFailure = 'credentials' | 'exists' | 'code' | 'generic';

/** Result of an email and password sign-in. */
export type SignInResult =
  | { readonly status: 'signed-in' }
  | { readonly status: 'two-factor' }
  | { readonly status: 'error'; readonly reason: AuthFailure };

/** Result of creating an account. */
export type SignUpResult =
  { readonly status: 'created' } | { readonly status: 'error'; readonly reason: AuthFailure };

/** Options of {@link createSession}. */
export interface SessionOptions {
  /** Origin of the API. Empty uses the page origin. */
  readonly baseUrl?: string;
  /** Fetch implementation. The browser default keeps the session cookie. */
  readonly fetch?: typeof globalThis.fetch;
}

interface AuthErrorBody {
  readonly code?: string;
  readonly message?: string;
}

/**
 * Talks to Better Auth on `/api/auth` for the shell.
 *
 * Preconditions: the page origin is trusted by the API.
 * Postconditions: a successful sign-in or sign-up leaves the session cookie for later `/api/v1` calls.
 * Data contract: passwords are sent only to the auth endpoints and are never stored by this client.
 */
export interface SessionClient {
  /**
   * Signs in with email and password.
   *
   * @param email - Account address.
   * @param password - Account password.
   * @returns Signed in, a second step, or a failure reason.
   */
  signIn(email: string, password: string): Promise<SignInResult>;
  /**
   * Creates an account.
   *
   * @param name - Display name.
   * @param email - Account address.
   * @param password - Account password, at least 12 characters.
   * @returns Created, or a failure reason.
   */
  signUp(name: string, email: string, password: string): Promise<SignUpResult>;
  /**
   * Completes sign-in with the verification code.
   *
   * @param code - One-time code from the verification app.
   * @returns Signed in, or a failure reason.
   */
  verifyCode(code: string): Promise<SignInResult>;
  /**
   * Ends the session.
   *
   * Postconditions: the cookie is cleared when the server accepts the request.
   */
  signOut(): Promise<void>;
}

function failure(code: string | undefined, status: number): AuthFailure {
  if (code === 'USER_ALREADY_EXISTS' || code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL') {
    return 'exists';
  }
  if (code === 'INVALID_CODE' || code === 'INVALID_TWO_FACTOR_COOKIE') {
    return 'code';
  }
  if (code === 'INVALID_EMAIL_OR_PASSWORD' || status === 401) {
    return 'credentials';
  }
  return 'generic';
}

async function readError(response: Response): Promise<AuthFailure> {
  try {
    const body = (await response.json()) as AuthErrorBody;
    return failure(body.code, response.status);
  } catch {
    return failure(undefined, response.status);
  }
}

/**
 * Builds the auth client.
 *
 * @param options - Base URL and fetch.
 * @returns Sign-in, sign-up, verification and sign-out.
 */
export function createSession(options: SessionOptions = {}): SessionClient {
  const base = options.baseUrl ?? '';
  const fetchImpl = options.fetch ?? globalThis.fetch;

  async function post(path: string, body: unknown): Promise<Response> {
    return fetchImpl(`${base}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
    });
  }

  return {
    async signIn(email, password) {
      const response = await post('/api/auth/sign-in/email', { email, password });
      if (!response.ok) {
        return { status: 'error', reason: await readError(response) };
      }
      const payload = (await response.json()) as { twoFactorRedirect?: boolean };
      if (payload.twoFactorRedirect === true) {
        return { status: 'two-factor' };
      }
      return { status: 'signed-in' };
    },
    async signUp(name, email, password) {
      const response = await post('/api/auth/sign-up/email', { name, email, password });
      if (!response.ok) {
        return { status: 'error', reason: await readError(response) };
      }
      return { status: 'created' };
    },
    async verifyCode(code) {
      const response = await post('/api/auth/two-factor/verify-totp', { code });
      if (!response.ok) {
        return { status: 'error', reason: await readError(response) };
      }
      return { status: 'signed-in' };
    },
    async signOut() {
      await post('/api/auth/sign-out', {});
    },
  };
}
