import { useQuery } from '@tanstack/react-query';
import { useState, type ChangeEvent } from 'react';
import type { Utility, UtilityBillExtracted, UtilityTemplate } from '@domusafe/contracts';
import { useApi } from '@/components/api-context.js';
import { Field } from '@/components/shell/page.js';
import { Button } from '@/components/ui/button.js';
import { Textarea } from '@/components/ui/textarea.js';
import { problemText } from '@/lib/copy.js';
import { utilityTemplatesQuery } from '@/lib/queries.js';
import { m } from '@/paraglide/messages.js';
import { extractBillFields } from './bill-extract.js';

/**
 * Lazy-loaded bill recognition assist: paste text or scan a photo, then apply fields.
 * Kept in its own chunk so Tesseract and this UI stay out of the shell gzip budget.
 *
 * Preconditions: the caller can write utilities. Templates load with `utilities.read`.
 * Postconditions: confirming saves a bill row and returns extracted fields to the parent.
 * Data contract: recognition runs in the browser; only confirmed Class C values go to the API.
 *
 * @param props - House, utility kind and apply callback.
 * @returns The assist panel.
 */
export function BillAssistPanel(props: {
  readonly familyId: string;
  readonly kind: Utility['kind'];
  readonly onApply: (suggestion: {
    readonly extracted: UtilityBillExtracted;
    readonly template: UtilityTemplate | null;
  }) => Promise<void>;
}) {
  const api = useApi();
  const templatesQuery = useQuery(utilityTemplatesQuery(api, props.familyId, props.kind));
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<ReturnType<typeof extractBillFields> | null>(null);

  function runExtract(source: string): void {
    const templates = templatesQuery.data ?? [];
    const next = extractBillFields(source, templates, props.kind);
    setSuggestion(next);
    if (next.matchedFields.length === 0) {
      setError(m.casaBillNoMatch());
    } else {
      setError(null);
    }
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file === undefined) {
      return;
    }
    setError(null);
    setSuggestion(null);
    if (file.type.startsWith('text/') || file.name.toLowerCase().endsWith('.txt')) {
      const source = await file.text();
      setText(source);
      runExtract(source);
      return;
    }
    if (!file.type.startsWith('image/')) {
      setError(m.casaBillUnsupportedFile());
      return;
    }
    setScanning(true);
    try {
      const { recogniseBillImage } = await import('./bill-ocr.js');
      const source = await recogniseBillImage(file);
      setText(source);
      runExtract(source);
    } catch {
      setError(m.casaBillScanFailed());
    } finally {
      setScanning(false);
    }
  }

  async function confirm(): Promise<void> {
    if (suggestion === null || suggestion.matchedFields.length === 0) {
      setError(m.casaBillNoMatch());
      return;
    }
    setPending(true);
    setError(null);
    try {
      await props.onApply({
        extracted: suggestion.extracted,
        template: suggestion.template,
      });
    } catch (caught) {
      setError(problemText(caught));
    } finally {
      setPending(false);
    }
  }

  const hints = suggestion?.template?.fieldHints;

  return (
    <section className="grid gap-3 border-t border-border pt-4">
      <h3 className="text-[13px] font-medium">{m.casaBillAssistTitle()}</h3>
      <p className="text-[12px] text-muted-foreground">{m.casaBillAssistLead()}</p>
      {templatesQuery.isError ? (
        <p role="alert" className="text-[12px] text-destructive">
          {problemText(templatesQuery.error)}
        </p>
      ) : null}
      <Field htmlFor={`bill-assist-${props.kind}-text`} label={m.casaBillPaste()}>
        <Textarea
          id={`bill-assist-${props.kind}-text`}
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={6}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          size="emergency"
          disabled={scanning || text.trim() === ''}
          onClick={() => runExtract(text)}
        >
          {m.casaBillRecognize()}
        </Button>
        <label className="inline-flex min-h-12 cursor-pointer items-center gap-2 text-[13px]">
          <span className="rounded-md border border-border px-4 py-3">
            {scanning ? m.casaBillScanning() : m.casaBillUpload()}
          </span>
          <input
            type="file"
            accept="image/*,text/plain"
            className="sr-only"
            disabled={scanning}
            onChange={(event) => void onFile(event)}
          />
        </label>
      </div>
      {suggestion !== null && suggestion.matchedFields.length > 0 ? (
        <div className="grid gap-2 text-[13px]">
          <p className="text-muted-foreground">
            {m.casaBillMatched({ count: suggestion.matchedFields.length })}
            {suggestion.template === null ? '' : ` · ${suggestion.template.providerName}`}
          </p>
          {hints !== undefined && Object.keys(hints).length > 0 ? (
            <ul className="grid gap-1 text-[12px] text-muted-foreground">
              {Object.entries(hints).map(([key, label]) => (
                <li key={key}>
                  {label}
                  {formatHintValue(suggestion.extracted, key)}
                </li>
              ))}
            </ul>
          ) : null}
          <Button type="button" size="emergency" disabled={pending} onClick={() => void confirm()}>
            {m.casaBillApply()}
          </Button>
        </div>
      ) : null}
      {error !== null ? (
        <p role="alert" className="text-[12px] text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function formatHintValue(extracted: UtilityBillExtracted, key: string): string {
  const value = (() => {
    switch (key) {
      case 'customerCode':
        return extracted.customerCode;
      case 'supplyPointCode':
        return extracted.supplyPointCode;
      case 'contractCode':
        return extracted.contractCode;
      case 'providerName':
        return extracted.providerName;
      case 'dueDate':
        return extracted.dueDate;
      case 'iban':
        return extracted.iban;
      case 'payeeName':
        return extracted.payeeName;
      case 'amount':
        return extracted.amountMinor === undefined
          ? undefined
          : `${(extracted.amountMinor / 100).toFixed(2)} ${extracted.currency ?? ''}`.trim();
      default:
        return undefined;
    }
  })();
  return value === undefined || value === '' ? '' : `: ${value}`;
}
