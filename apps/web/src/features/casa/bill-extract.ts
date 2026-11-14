import type { UtilityBillExtracted, UtilityRecognitionPatterns, UtilityTemplate } from '@domusafe/contracts';

/** Fields the assist panel can copy onto a utility contract. */
export interface BillAssistSuggestion {
  readonly extracted: UtilityBillExtracted;
  readonly template: UtilityTemplate | null;
  readonly matchedFields: readonly string[];
}

/**
 * Turns an Italian or European amount string into minor units (cents).
 *
 * Preconditions: `raw` is a decimal amount with `.` or `,` as the decimal separator.
 * Postconditions: returns an integer ≥ 0, or `null` when the text is not an amount.
 * Data contract: thousands separators are stripped; the last separator is the decimal mark.
 *
 * @param raw - Amount text from a bill.
 * @returns Minor units, or `null`.
 */
export function parseAmountMinor(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, '').replace(/€/g, '');
  if (cleaned === '') {
    return null;
  }
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let normalized = cleaned;
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      normalized = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = cleaned.replace(/,/g, '');
    }
  } else if (lastComma >= 0) {
    normalized = cleaned.replace(',', '.');
  }
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) {
    return null;
  }
  return Math.round(value * 100);
}

/**
 * Normalises a day/month/year string to `YYYY-MM-DD`.
 *
 * Preconditions: day and month are present; year may be two digits.
 * Postconditions: returns a calendar date, or `null` when the parts are invalid.
 * Data contract: two-digit years map to 2000–2099.
 *
 * @param raw - Date text from a bill.
 * @returns ISO date, or `null`.
 */
export function parseBillDate(raw: string): string | null {
  const match = /^([0-3]?\d)[/.-]([01]?\d)[/.-]((?:20)?\d{2})$/.exec(raw.trim());
  if (match === null) {
    return null;
  }
  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = Number(match[3]);
  if (year < 100) {
    year += 2000;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const check = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(check.getTime())) {
    return null;
  }
  return iso;
}

/**
 * Runs one field's recognition patterns against bill text.
 *
 * Preconditions: patterns are RegExp source strings (may include `(?i)`).
 * Postconditions: returns the first capture group that matched, or `null`.
 * Data contract: invalid patterns are skipped without throwing.
 *
 * @param text - Bill text.
 * @param patterns - Pattern sources for one field.
 * @returns Captured text, or `null`.
 */
export function matchFirst(text: string, patterns: readonly string[]): string | null {
  for (const source of patterns) {
    try {
      const ignoreCase = source.startsWith('(?i)');
      const body = ignoreCase ? source.slice(4) : source;
      const match = new RegExp(body, ignoreCase ? 'i' : undefined).exec(text);
      const captured = match?.[1]?.trim();
      if (captured !== undefined && captured !== '') {
        return captured;
      }
    } catch {
      // Skip broken patterns from a family template.
    }
  }
  return null;
}

/**
 * Applies recognition patterns to free text and builds a structured suggestion.
 *
 * Preconditions: `text` is plain text (paste or OCR output). Templates may be empty.
 * Postconditions: prefers the template with the most matched fields for `kind`.
 * Data contract: amounts become minor units; dates become `YYYY-MM-DD`.
 *
 * @param text - Bill text.
 * @param templates - Active templates to try.
 * @param kind - Utility kind of the open card.
 * @returns Suggestion with matched field names.
 */
export function extractBillFields(
  text: string,
  templates: readonly UtilityTemplate[],
  kind: UtilityTemplate['kind'],
): BillAssistSuggestion {
  const candidates = templates.filter((item) => item.kind === kind && item.active);
  const pool = candidates.length > 0 ? candidates : templates.filter((item) => item.active);
  let best: BillAssistSuggestion = {
    extracted: {},
    template: null,
    matchedFields: [],
  };
  for (const template of pool) {
    const suggestion = applyPatterns(text, template.recognitionPatterns, template);
    if (suggestion.matchedFields.length > best.matchedFields.length) {
      best = suggestion;
    }
  }
  if (best.matchedFields.length === 0) {
    return applyPatterns(text, builtinFallback(kind), null);
  }
  return best;
}

function applyPatterns(
  text: string,
  patterns: UtilityRecognitionPatterns,
  template: UtilityTemplate | null,
): BillAssistSuggestion {
  const matchedFields: string[] = [];
  const extracted: UtilityBillExtracted = {};
  const customerCode = matchFirst(text, patterns.customerCode ?? []);
  if (customerCode !== null) {
    extracted.customerCode = customerCode.slice(0, 80);
    matchedFields.push('customerCode');
  }
  const supplyPointCode = matchFirst(text, patterns.supplyPointCode ?? []);
  if (supplyPointCode !== null) {
    extracted.supplyPointCode = supplyPointCode.slice(0, 80);
    matchedFields.push('supplyPointCode');
  }
  const contractCode = matchFirst(text, patterns.contractCode ?? []);
  if (contractCode !== null) {
    extracted.contractCode = contractCode.slice(0, 80);
    matchedFields.push('contractCode');
  }
  const providerName = matchFirst(text, patterns.providerName ?? []);
  if (providerName !== null) {
    extracted.providerName = providerName.slice(0, 160);
    matchedFields.push('providerName');
  }
  const amountRaw = matchFirst(text, patterns.amount ?? []);
  if (amountRaw !== null) {
    const amountMinor = parseAmountMinor(amountRaw);
    if (amountMinor !== null) {
      extracted.amountMinor = amountMinor;
      extracted.currency = 'EUR';
      matchedFields.push('amount');
    }
  }
  const dueRaw = matchFirst(text, patterns.dueDate ?? []);
  if (dueRaw !== null) {
    const dueDate = parseBillDate(dueRaw);
    if (dueDate !== null) {
      extracted.dueDate = dueDate;
      matchedFields.push('dueDate');
    }
  }
  const iban = matchFirst(text, patterns.iban ?? []);
  if (iban !== null) {
    extracted.iban = iban.replace(/\s/g, '').toUpperCase().slice(0, 34);
    matchedFields.push('iban');
  }
  const payeeName = matchFirst(text, patterns.payeeName ?? []);
  if (payeeName !== null) {
    extracted.payeeName = payeeName.slice(0, 160);
    matchedFields.push('payeeName');
  }
  if (template !== null) {
    extracted.templateId = template.id;
  }
  if (matchedFields.length > 0) {
    extracted.rawText = text.slice(0, 20_000);
  }
  return { extracted, template, matchedFields };
}

function builtinFallback(kind: UtilityTemplate['kind']): UtilityRecognitionPatterns {
  const shared: UtilityRecognitionPatterns = {
    customerCode: ['(?i)codice\\s*cliente[:\\s]+([A-Z0-9/-]{4,40})'],
    amount: [
      '(?i)(?:totale\\s*da\\s*pagare|importo)[:\\s]*€?\\s*([0-9]{1,3}(?:[.\\s][0-9]{3})*[.,][0-9]{2})',
    ],
    dueDate: ['(?i)scadenza[:\\s]*([0-3]?\\d[/.-][01]?\\d[/.-](?:20)?\\d{2})'],
    iban: ['\\b(IT\\d{2}[A-Z]\\d{10,30})\\b'],
  };
  if (kind === 'electricity') {
    return {
      ...shared,
      supplyPointCode: ['(?i)\\b(IT\\d{3}E\\d{8})\\b'],
    };
  }
  if (kind === 'gas') {
    return {
      ...shared,
      supplyPointCode: ['(?i)(?:pdr|punto\\s*di\\s*riconsegna)[:\\s]*([0-9]{14})'],
    };
  }
  return shared;
}
