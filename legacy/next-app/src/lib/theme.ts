/**
 * Tema chiaro / scuro / sistema — preferenza account (Material Design tokens).
 * Cache locale solo per anti-FOUC; fonte di verità = account quando autenticati.
 */

export type ThemePreference = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'domusafe-theme-preference';

export const THEME_LABELS: Record<ThemePreference, string> = {
  light: 'Chiaro',
  dark: 'Scuro',
  system: 'Sistema',
};

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

/** Risolve light|dark effettivo dalla preferenza + media query. */
export function resolveThemeMode(
  preference: ThemePreference,
  systemDark = false
): 'light' | 'dark' {
  if (preference === 'system') return systemDark ? 'dark' : 'light';
  return preference;
}

export function readStoredThemePreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system';
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(raw) ? raw : 'system';
  } catch {
    return 'system';
  }
}

export function writeStoredThemePreference(preference: ThemePreference): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    /* ignore quota / private mode */
  }
}

/** Applica `data-theme` su <html> per i token CSS Material. */
export function applyThemeToDocument(preference: ThemePreference): void {
  if (typeof document === 'undefined') return;
  const systemDark =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  const mode = resolveThemeMode(preference, systemDark);
  document.documentElement.dataset.theme = mode;
  document.documentElement.style.colorScheme = mode;
}
