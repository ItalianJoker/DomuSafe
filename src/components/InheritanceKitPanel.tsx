'use client';

/**
 * Kit eredità PDF (stampa A4) — Premium, contesto successione Famiglia.
 * Zero librerie PDF: HTML + @media print (come il foglio ICE).
 */

import { FileDown, ScrollText } from 'lucide-react';
import type { SuccessionChecklist } from '@/types/checklists';
import type { FamilyBranding } from '@/types/premium';
import { DomuSafeLogo } from '@/components/DomuSafeLogo';

const CATEGORY_LABELS: Record<
  SuccessionChecklist['items'][number]['category'],
  string
> = {
  DOCS: 'Documenti',
  CONTACTS: 'Contatti',
  WILL: 'Testamento',
  BANK: 'Banche',
  INSURANCE: 'Assicurazioni',
  DIGITAL: 'Digitale',
  DEADLINE: 'Scadenze',
};

interface InheritanceKitPanelProps {
  checklist: SuccessionChecklist;
  familyName: string;
  branding?: FamilyBranding | null;
}

export function InheritanceKitPanel({
  checklist,
  familyName,
  branding,
}: InheritanceKitPanelProps) {
  const brandName = branding?.hostDisplayName?.trim() || 'DomuSafe';
  const done = checklist.items.filter((i) => i.done).length;
  const total = checklist.items.length;

  return (
    <section className="space-y-4">
      <div className="no-print rounded-lg border-2 border-zinc-900 bg-[#f7f3ea] p-4">
        <h3 className="flex items-center gap-2 font-display text-lg font-black">
          <ScrollText className="size-6" aria-hidden />
          Kit eredità (PDF / stampa)
        </h3>
        <p className="mt-1 text-sm text-zinc-700">
          Esporta la checklist successione della Famiglia in un foglio A4 da
          archiviare o consegnare al professionista di fiducia. Usa «Stampa» del
          browser e scegli «Salva come PDF» se vuoi un file.
        </p>
        <button
          type="button"
          className="mt-3 inline-flex min-h-12 items-center gap-2 rounded-md border-2 border-zinc-900 bg-zinc-950 px-4 font-bold text-white"
          onClick={() => {
            const body = window.document.body;
            body.classList.add('print-inheritance-only');
            body.classList.remove('print-runbook-only');
            window.print();
            window.setTimeout(() => {
              body.classList.remove('print-inheritance-only');
            }, 500);
          }}
        >
          <FileDown className="size-5" aria-hidden />
          Stampa / PDF kit eredità
        </button>
        <p className="mt-2 text-xs text-zinc-600">
          Completamento checklist: {done}/{total}
        </p>
      </div>

      <article
        className="inheritance-kit print-page mx-auto max-w-[194mm] border border-zinc-300 bg-white p-4 text-black print:block"
        aria-label="Kit eredità stampabile"
      >
        <header className="mb-3 flex items-start justify-between gap-3 border-b-2 border-black pb-2">
          <div className="flex items-start gap-2">
            {branding?.logoDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={branding.logoDataUrl}
                alt=""
                className="h-9 w-9 object-contain"
              />
            ) : (
              <DomuSafeLogo size={36} className="shrink-0" />
            )}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest">
                {brandName}
              </p>
              <h1 className="text-xl font-black">Kit eredità · {familyName}</h1>
              <p className="text-xs">
                Aggiornato{' '}
                {new Date(checklist.updatedAt).toLocaleString('it-IT')} ·{' '}
                {done}/{total} attività completate
              </p>
              {branding?.tagline ? (
                <p className="text-xs text-zinc-600">{branding.tagline}</p>
              ) : null}
            </div>
          </div>
        </header>

        <p className="mb-3 text-xs leading-relaxed">
          Documento di lavoro per l’eventuale successione della Famiglia. Non
          sostituisce consulenza legale o notarile. Conservalo in luogo sicuro;
          contiene riferimenti organizzativi, non necessariamente dati
          patrimoniali in chiaro.
        </p>

        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b-2 border-black text-left">
              <th className="py-1 pr-2">Stato</th>
              <th className="py-1 pr-2">Categoria</th>
              <th className="py-1 pr-2">Attività</th>
              <th className="py-1">Note / scadenze</th>
            </tr>
          </thead>
          <tbody>
            {checklist.items.map((item) => (
              <tr key={item.id} className="border-b border-zinc-300 align-top">
                <td className="py-1 pr-2 font-bold">
                  {item.done ? 'FATTO' : 'DA FARE'}
                </td>
                <td className="py-1 pr-2">
                  {CATEGORY_LABELS[item.category]}
                </td>
                <td className="py-1 pr-2">{item.label}</td>
                <td className="py-1">
                  {[item.deadlineHint, item.note].filter(Boolean).join(' — ') ||
                    '—'}
                </td>
              </tr>
            ))}
            {(checklist.customFields ?? []).map((cf) => (
              <tr key={cf.id} className="border-b border-zinc-300 align-top">
                <td className="py-1 pr-2 font-bold">EXTRA</td>
                <td className="py-1 pr-2">Personalizzato</td>
                <td className="py-1 pr-2">{cf.label}</td>
                <td className="py-1">{cf.value || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <footer className="mt-4 border-t border-zinc-400 pt-2 text-[9px] text-zinc-600">
          DomuSafe · Kit eredità Famiglia · Piano Premium · Stampa riservata
        </footer>
      </article>
    </section>
  );
}
