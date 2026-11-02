'use client';

/**
 * Contesto sessione: cookie httpOnly + data-key / family-key solo in memoria.
 * Gate: auth → Famiglia → runbook family-scoped (chiave condivisa).
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
  clearFamilyKeyMemory,
  clearUnlockedDataKey,
  createFamilyApi,
  createInviteApi,
  ensureFamilyKeyForSession,
  fetchSession,
  getFamilyKeyRaw,
  getUnlockedDataKey,
  getUnlockedFamilyKey,
  joinFamilyApi,
  loginAccount,
  logoutAccount,
  markTutorialCompletedApi,
  registerAccount,
  applySaasLicenseApi,
  startPremiumTrialApi,
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
  /** Account data-key (wrap / unwrap family-key). */
  dataKey: CryptoKey | null;
  /**
   * Family-key: cifra case/successione (condivisa tra membri).
   * Null finché non c’è Famiglia sbloccata.
   */
  familyKey: CryptoKey | null;
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
  const [familyKey, setFamilyKey] = useState<CryptoKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applyReady = useCallback(
    async (
      acc: DomuAccount,
      fam: DomuFamily | null,
      accountKey: CryptoKey
    ) => {
      setAccount(acc);
      setDataKey(accountKey);
      if (!acc.familyId || !fam) {
        setFamily(null);
        setFamilyKey(null);
        setStatus('needs_family');
        return;
      }
      try {
        const ensured = await ensureFamilyKeyForSession({
          family: fam,
          accountId: acc.accountId,
          accountDataKey: accountKey,
        });
        setFamily(ensured.family);
        setFamilyKey(ensured.familyKey);
        setStatus('ready');
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : 'Impossibile sbloccare la chiave Famiglia'
        );
        setFamily(fam);
        setFamilyKey(null);
        setStatus('needs_family');
      }
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
          await applyReady(sess.account, sess.family, key);
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
        await applyReady(acc, sess?.family ?? null, key);
        return;
      }
      try {
        const joined = await joinFamilyApi(invite, key);
        await applyReady(joined.account, joined.family, key);
        setFamilyKey(joined.familyKey);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Invito non valido');
        await applyReady(acc, null, key);
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
      await applyReady(sess?.account ?? account, sess?.family ?? family, key);
    },
    [account, family, applyReady]
  );

  const logout = useCallback(async () => {
    await logoutAccount();
    clearUnlockedDataKey();
    clearFamilyKeyMemory();
    setAccount(null);
    setFamily(null);
    setDataKey(null);
    setFamilyKey(null);
    setStatus('unauthenticated');
  }, []);

  const createOwnedFamily = useCallback(
    async (name: string) => {
      if (!dataKey || !account) return;
      setError(null);
      const result = await createFamilyApi(
        name,
        dataKey,
        account.accountId
      );
      setFamilyKey(result.familyKey);
      await applyReady(result.account, result.family, dataKey);
    },
    [dataKey, account, applyReady]
  );

  const joinFamily = useCallback(
    async (inviteCode: string) => {
      if (!dataKey) return;
      setError(null);
      const result = await joinFamilyApi(inviteCode, dataKey);
      setFamilyKey(result.familyKey);
      await applyReady(result.account, result.family, dataKey);
    },
    [dataKey, applyReady]
  );

  const createInvite = useCallback(async () => {
    if (!family) return null;
    let familyKeyRaw = getFamilyKeyRaw(family.familyId);
    if (!familyKeyRaw && dataKey && account) {
      const ensured = await ensureFamilyKeyForSession({
        family,
        accountId: account.accountId,
        accountDataKey: dataKey,
      });
      setFamily(ensured.family);
      setFamilyKey(ensured.familyKey);
      familyKeyRaw = ensured.familyKeyRaw;
    }
    if (!familyKeyRaw) {
      setError('Chiave Famiglia non disponibile: sblocca di nuovo la sessione');
      return null;
    }
    const result = await createInviteApi(family.familyId, familyKeyRaw);
    setFamily(result.family);
    return { inviteCode: result.inviteCode };
  }, [family, dataKey, account]);

  const completeTutorial = useCallback(async () => {
    const next = await markTutorialCompletedApi();
    setAccount(next);
  }, []);

  const startTrial = useCallback(async () => {
    if (!account) return;
    setError(null);
    try {
      const next = await startPremiumTrialApi();
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
      if (sess.family) {
        const fk = getUnlockedFamilyKey(sess.family.familyId);
        if (fk) setFamilyKey(fk);
      }
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
    familyKey,
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
  if (!ctx) {
    throw new Error('useSession fuori da SessionProvider');
  }
  return ctx;
}
