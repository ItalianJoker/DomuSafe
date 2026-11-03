/**
 * Reminder scadenze per Panoramica (questa settimana / questo mese).
 */

import type { DomusRunbookDocument, ServiceEntry } from '@/types/domus';
import {
  FAMILY_DEADLINE_CATALOG,
  FAMILY_SUBSCRIPTION_CATALOG,
  FAMILY_UTILITY_CATALOG,
  PERSONAL_SUBSCRIPTION_CATALOG,
  catalogLabel,
} from '@/lib/service-catalog';

export type DeadlineWindow = 'week' | 'month' | 'overdue' | 'later';

export type UpcomingDeadline = {
  id: string;
  label: string;
  renewalDate: string;
  window: DeadlineWindow;
  daysUntil: number;
  source: 'famiglia' | 'residente';
  residentName?: string;
};

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseYmd(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return null;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function windowFor(daysUntil: number): DeadlineWindow {
  if (daysUntil < 0) return 'overdue';
  if (daysUntil <= 7) return 'week';
  if (daysUntil <= 31) return 'month';
  return 'later';
}

function findCatalogLabel(catalogId: string): string | null {
  for (const catalog of [
    FAMILY_UTILITY_CATALOG,
    FAMILY_SUBSCRIPTION_CATALOG,
    FAMILY_DEADLINE_CATALOG,
    PERSONAL_SUBSCRIPTION_CATALOG,
  ]) {
    const hit = catalog.find((c) => c.id === catalogId);
    if (hit) return hit.label;
  }
  if (catalogId === 'mobile_plan') return 'Piano mobile';
  return null;
}

function entryLabel(entry: ServiceEntry): string {
  const fromCatalog = findCatalogLabel(entry.catalogId);
  if (fromCatalog) return fromCatalog;
  if (entry.provider?.trim()) return entry.provider.trim();
  return entry.catalogId.startsWith('custom-')
    ? entry.catalogId.replace(/^custom-/, '') || 'Scadenza'
    : catalogLabel(FAMILY_DEADLINE_CATALOG, entry.catalogId);
}

function collectFromEntries(
  entries: ServiceEntry[],
  source: 'famiglia' | 'residente',
  today: Date,
  residentName?: string
): UpcomingDeadline[] {
  const out: UpcomingDeadline[] = [];
  for (const entry of entries) {
    if (!entry.renewalDate?.trim()) continue;
    const when = parseYmd(entry.renewalDate);
    if (!when) continue;
    const daysUntil = Math.round(
      (startOfDay(when).getTime() - startOfDay(today).getTime()) /
        (24 * 60 * 60 * 1000)
    );
    const win = windowFor(daysUntil);
    if (win === 'later') continue;
    out.push({
      id: `${source}:${residentName ?? 'fam'}:${entry.catalogId}:${entry.renewalDate}`,
      label: entryLabel(entry),
      renewalDate: entry.renewalDate,
      window: win,
      daysUntil,
      source,
      residentName,
    });
  }
  return out;
}

/** Scadenze in settimana / mese / scadute (tap → Casa o Emergenza). */
export function listUpcomingDeadlines(
  doc: DomusRunbookDocument,
  now: Date = new Date()
): UpcomingDeadline[] {
  const services = doc.level1_public.familyServices;
  const familyEntries: ServiceEntry[] = services
    ? [
        ...services.utilities,
        ...services.subscriptions,
        ...services.deadlines,
      ]
    : [];
  const items: UpcomingDeadline[] = [
    ...collectFromEntries(familyEntries, 'famiglia', now),
  ];
  for (const r of doc.level2_ice.residents) {
    const personal: ServiceEntry[] = [
      ...(r.personalSubscriptions ?? []),
      ...(r.mobilePlan?.renewalDate
        ? [
            {
              catalogId: 'mobile_plan',
              provider: r.mobilePlan.carrier || 'Mobile',
              renewalDate: r.mobilePlan.renewalDate,
            },
          ]
        : []),
    ];
    items.push(
      ...collectFromEntries(
        personal,
        'residente',
        now,
        r.fullName.trim() || 'Residente'
      )
    );
  }
  return items.sort((a, b) => a.daysUntil - b.daysUntil);
}

export function deadlinesByWindow(items: UpcomingDeadline[]): {
  week: UpcomingDeadline[];
  month: UpcomingDeadline[];
  overdue: UpcomingDeadline[];
} {
  return {
    overdue: items.filter((i) => i.window === 'overdue'),
    week: items.filter((i) => i.window === 'week'),
    month: items.filter((i) => i.window === 'month'),
  };
}
