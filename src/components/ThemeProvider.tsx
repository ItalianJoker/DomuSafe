'use client';

/**
 * ThemeProvider — Material chiaro/scuro/sistema.
 * Prima del login: localStorage. Dopo: preferenza account (sync server).
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
import {
  applyThemeToDocument,
  isThemePreference,
  readStoredThemePreference,
  writeStoredThemePreference,
  type ThemePreference,
} from '@/lib/theme';

interface ThemeContextValue {
  preference: ThemePreference;
  setPreference: (next: ThemePreference) => void;
  /** Persistenza account (se autenticato); altrimenti solo locale. */
  persistPreference: (next: ThemePreference) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

interface ThemeProviderProps {
  children: ReactNode;
  /** Preferenza da account (sovrascrive locale quando presente). */
  accountPreference?: ThemePreference | null;
  onPersistAccount?: (preference: ThemePreference) => Promise<void>;
}

export function ThemeProvider({
  children,
  accountPreference,
  onPersistAccount,
}: ThemeProviderProps) {
  const [localPreference, setLocalPreference] = useState<ThemePreference>(() =>
    readStoredThemePreference()
  );

  const preference: ThemePreference = isThemePreference(accountPreference)
    ? accountPreference
    : localPreference;

  useEffect(() => {
    applyThemeToDocument(preference);
    writeStoredThemePreference(preference);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyThemeToDocument(preference);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    setLocalPreference(next);
    writeStoredThemePreference(next);
    applyThemeToDocument(next);
  }, []);

  const persistPreference = useCallback(
    async (next: ThemePreference) => {
      setPreference(next);
      if (onPersistAccount) {
        await onPersistAccount(next);
      }
    },
    [onPersistAccount, setPreference]
  );

  const value = useMemo(
    () => ({ preference, setPreference, persistPreference }),
    [preference, setPreference, persistPreference]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme fuori da ThemeProvider');
  }
  return ctx;
}
