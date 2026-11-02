'use client';

/**
 * Contesto sessione: cookie httpOnly + data-key solo in memoria.
 * Gate: auth → Famiglia → runbook account-scoped.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { DomuAccount, DomuFamily } from '@/types/account';
import {
  clearUnlockedDataKey,
  createFamilyApi,
  applySaasLicenseApi,
  createInviteApi,
  fetchSession,
  getUnlockedDataKey,
  joinFamilyApi,
  loginAccount,
  logoutAccount,
  markTutorialCompletedApi,
  registerAccount,
  startTrialApi,
  unlockWithPassword,
} from '@/lib/auth-client';
import {
  inviteCodeFromPayload,
  parseInvitePayload,
} from '@/lib/family';
import { effectiveTierFromLicense } from '@/lib/trial';
import type { LicenseTier } from '@/types/domus';

type SessionStatus =
  | 'loading'
  | 'unauthenticated'
  | 'needs_unlock'
  | 'needs_family'
  | 'ready';

interface SessionContextValue {
  status: SessionStatus;
  account: DomuAccount | null;
  family: DomuFamily | null;
  dataKey: CryptoKey | null;
  effectiveTier: LicenseTier;
  error: string | null;
  register: (input: {
    email: string;
    password: string;
    displayName: string;
  }) => Promise<void>;
  login: (input: { email: string; password: string }) => Promise<void>;
  unlock: (password: string) => Promise<void>;
  logout: () => Promise<void>;
  createOwnedFamily: (name: string) => Promise<void>;
  joinFamily: (inviteCode: string) => Promise<void>;
  createInvite: () => Promise<{ inviteCode: string } | null>;
  completeTutorial: () => Promise<void>;
  startTrial: () => Promise<void>;
  applySaasLicense: (saasToken: string) => Promise<void>;
  refreshAccount: () => Promise<void>;
  peekInviteFromHash: () => string | null;
}

const SessionContext = createContext<SessionContextValue | null>(null);

function peekInviteFromHash(): string | null {
  if (typeof window === 'undefined') return null;
  const parsed = parseInvitePayload(window.location.href);
  return parsed ? inviteCodeFromPayload(parsed) : null;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [account, setAccount] = useState<DomuAccount | null>(null);
  const [family, setFamily] = useState<DomuFamily | null>(null);
  const [dataKey, setDataKey] = useState<CryptoKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applyReady = useCallback(
    (acc: DomuAccount, fam: DomuFamily | null, key: CryptoKey) => {
      setAccount(acc);
      setFamily(fam);
      setDataKey(key);
      if (!acc.familyId || !fam) {
        setStatus('needs_family');
        return;
      }
      setStatus('ready');
    },
    []
  );

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const sess = await fetchSession();
        if (!active) return;
        if (!sess) {
          setStatus('unauthenticated');
          return;
        }
        const key = getUnlockedDataKey(sess.account.accountId);
        if (key) {
          applyReady(sess.account, sess.family, key);
        } else {
          setAccount(sess.account);
          setFamily(sess.family);
          setStatus('needs_unlock');
        }
      } catch {
        if (active) setStatus('unauthenticated');
      }
    })();
    return () => {
      active = false;
    };
  }, [applyReady]);

  const maybeJoinInvite = useCallback(
    async (acc: DomuAccount, key: CryptoKey) => {
      const invite = peekInviteFromHash();
      if (!invite || acc.familyId) {
        const sess = await fetchSession();
        applyReady(acc, sess?.family ?? null, key);
        return;
      }
      try {
        const joined = await joinFamilyApi(invite);
        applyReady(joined.account, joined.family, key);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Invito non valido');
        applyReady(acc, null, key);
      }
    },
    [applyReady]
  );

  const register = useCallback(
    async (input: {
      email: string;
      password: string;
      displayName: string;
    }) => {
      setError(null);
      const { account: acc, dataKey: key } = await registerAccount(input);
      await maybeJoinInvite(acc, key);
    },
    [maybeJoinInvite]
  );

  const login = useCallback(
    async (input: { email: string; password: string }) => {
      setError(null);
      const { account: acc, dataKey: key } = await loginAccount(input);
      await maybeJoinInvite(acc, key);
    },
    [maybeJoinInvite]
  );

  const unlock = useCallback(
    async (password: string) => {
      setError(null);
      if (!account) {
        setStatus('unauthenticated');
        return;
      }
      const key = await unlockWithPassword(account, password);
      const sess = await fetchSession();
      applyReady(sess?.account ?? account, sess?.family ?? family, key);
    },
    [account, family, applyReady]
  );

  const logout = useCallback(async () => {
    await logoutAccount();
    clearUnlockedDataKey();
    setAccount(null);
    setFamily(null);
    setDataKey(null);
    setStatus('unauthenticated');
  }, []);

  const createOwnedFamily = useCallback(
    async (name: string) => {
      if (!dataKey) return;
      setError(null);
      const result = await createFamilyApi(name);
      applyReady(result.account, result.family, dataKey);
    },
    [dataKey, applyReady]
  );

  const joinFamily = useCallback(
    async (inviteCode: string) => {
      if (!dataKey) return;
      setError(null);
      const result = await joinFamilyApi(inviteCode);
      applyReady(result.account, result.family, dataKey);
    },
    [dataKey, applyReady]
  );

  const createInvite = useCallback(async () => {
    const result = await createInviteApi();
    setFamily(result.family);
    return { inviteCode: result.inviteCode };
  }, []);

  const completeTutorial = useCallback(async () => {
    const next = await markTutorialCompletedApi();
    setAccount(next);
  }, []);

  const startTrial = useCallback(async () => {
    if (!account) return;
    setError(null);
    try {
      const next = await startTrialApi();
      setAccount(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Prova non disponibile');
      throw e;
    }
  }, [account]);

  const applySaasLicense = useCallback(async (saasToken: string) => {
    setError(null);
    try {
      const next = await applySaasLicenseApi(saasToken);
      setAccount(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chiave licenza non valida');
      throw e;
    }
  }, []);

  const refreshAccount = useCallback(async () => {
    const sess = await fetchSession();
    if (sess) {
      setAccount(sess.account);
      setFamily(sess.family);
    }
  }, []);

  const effectiveTier = useMemo(
    () =>
      account
        ? effectiveTierFromLicense(account.license)
        : ('FREE' as LicenseTier),
    [account]
  );

  const value: SessionContextValue = {
    status,
    account,
    family,
    dataKey,
    effectiveTier,
    error,
    register,
    login,
    unlock,
    logout,
    createOwnedFamily,
    joinFamily,
    createInvite,
    completeTutorial,
    startTrial,
    applySaasLicense,
    refreshAccount,
    peekInviteFromHash,
  };

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession richiede SessionProvider');
  return ctx;
}
