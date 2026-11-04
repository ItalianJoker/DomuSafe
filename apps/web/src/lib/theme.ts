/** Account theme values accepted by `PATCH /me/profile`. */
export const THEMES = ['light', 'dark', 'system'] as const;

/** A theme preference: light, dark, or follow the device. */
export type ThemePreference = (typeof THEMES)[number];

/** Local storage key used before sign-in and as a paint hint. Matches `public/theme-init.js`. */
export const THEME_STORAGE_KEY = 'domusafe.theme';

/**
 * Narrows an unknown value to a theme preference.
 *
 * @param value - Stored or submitted value.
 * @returns Whether it is `light`, `dark` or `system`.
 */
export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

/**
 * Reads the theme saved on this device.
 *
 * Preconditions: `localStorage` may be unavailable.
 * Postconditions: does not throw.
 * Data contract: missing or unknown values become `system`.
 *
 * @returns The stored preference.
 */
export function readStoredTheme(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

/**
 * Resolves a preference against the device color scheme.
 *
 * @param theme - Saved preference.
 * @param prefersDark - Whether the device currently prefers a dark scheme.
 * @returns The concrete scheme to paint.
 */
export function resolvedColorScheme(theme: ThemePreference, prefersDark: boolean): 'light' | 'dark' {
  if (theme === 'system') {
    return prefersDark ? 'dark' : 'light';
  }
  return theme;
}

/**
 * Applies a theme to the document and remembers it on the device.
 *
 * Preconditions: a document is available.
 * Postconditions: `documentElement.dataset.theme` equals `theme`; the browser chrome color matches.
 * Data contract: `system` stays `system` on the element so the stylesheet can follow the device.
 *
 * @param theme - Preference to apply.
 */
export function applyTheme(theme: ThemePreference): void {
  document.documentElement.dataset.theme = theme;
  const dark =
    resolvedColorScheme(theme, window.matchMedia('(prefers-color-scheme: dark)').matches) === 'dark';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#08090a' : '#ffffff');
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private mode can reject storage; the document attribute still paints this visit.
  }
}

/**
 * Repaints when the device scheme changes while the preference is automatic.
 *
 * Preconditions: called once at startup.
 * Postconditions: a media-query listener calls {@link applyTheme} only for `system`.
 */
export function watchSystemTheme(): void {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener('change', () => {
    if (document.documentElement.dataset.theme === 'system') {
      applyTheme('system');
    }
  });
}
