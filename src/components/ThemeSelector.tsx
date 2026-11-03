'use client';

/**
 * Selettore tema Material — Chiaro / Scuro / Sistema.
 * Bottoni XL (≥48px), alto contrasto (usabilità emergenza).
 */

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';
import { THEME_LABELS, type ThemePreference } from '@/lib/theme';

const OPTIONS: Array<{
  id: ThemePreference;
  label: string;
  icon: typeof Sun;
}> = [
  { id: 'light', label: THEME_LABELS.light, icon: Sun },
  { id: 'dark', label: THEME_LABELS.dark, icon: Moon },
  { id: 'system', label: THEME_LABELS.system, icon: Monitor },
];

interface ThemeSelectorProps {
  /** Compatto in header (icone); completo in impostazioni. */
  compact?: boolean;
  className?: string;
}

export function ThemeSelector({
  compact = false,
  className = '',
}: ThemeSelectorProps) {
  const { preference, persistPreference } = useTheme();

  return (
    <div
      role="group"
      aria-label="Tema interfaccia"
      className={`inline-flex rounded-[var(--md-radius-md)] border-2 border-[var(--md-outline)] bg-[var(--md-surface-container)] p-1 ${className}`}
    >
      {OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const active = preference === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            aria-pressed={active}
            aria-label={`Tema ${opt.label}`}
            title={opt.label}
            className={`inline-flex min-h-12 min-w-12 items-center justify-center gap-2 rounded-[var(--md-radius-sm)] px-3 font-bold transition ${
              active
                ? 'bg-[var(--md-primary)] text-[var(--md-on-primary)]'
                : 'bg-transparent text-[var(--md-on-surface)] hover:bg-[var(--md-surface-container-high)]'
            }`}
            onClick={() => void persistPreference(opt.id)}
          >
            <Icon className="size-5 shrink-0" aria-hidden />
            {!compact ? <span className="text-sm">{opt.label}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
