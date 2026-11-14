import type { ExportModule, ExportRecord } from '@domusafe/contracts';

const BOM = '\uFEFF';

/**
 * Formats a calendar date `YYYY-MM-DD` as `gg/mm/aaaa` for CSV export.
 *
 * @param value - ISO date or nullish.
 * @returns Italian date, or empty string.
 */
export function formatCsvDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/u.test(value)) {
    return typeof value === 'string' ? value : '';
  }
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${day ?? ''}/${month ?? ''}/${year ?? ''}`;
}

/**
 * Formats a minor-unit amount with Italian decimal comma.
 *
 * @param amountMinor - Integer minor units.
 * @param currency - Optional currency code.
 * @returns Display amount, or empty string.
 */
export function formatCsvAmount(amountMinor: unknown, currency: unknown = null): string {
  if (typeof amountMinor !== 'number' || !Number.isFinite(amountMinor)) {
    return '';
  }
  const major = (amountMinor / 100).toFixed(2).replace('.', ',');
  return typeof currency === 'string' && currency.length > 0 ? `${major} ${currency}` : major;
}

function cell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'boolean') {
    return value ? 'sì' : 'no';
  }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : String(value).replace('.', ',');
  }
  if (Array.isArray(value)) {
    return value.map((item) => cell(item)).join(', ');
  }
  if (typeof value !== 'string') {
    return '';
  }
  if (value.includes(';') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

function flattenRecord(record: ExportRecord): Record<string, string> {
  const row: Record<string, string> = {
    tabella: record.table,
    id: record.id,
    versione: String(record.version),
  };
  for (const [key, value] of Object.entries(record.data)) {
    if (key === 'sealed') {
      row.busta_cifrata = value === null ? 'no' : 'sì';
      continue;
    }
    if (key.endsWith('Date') || key === 'nextDueDate' || key === 'lastDoneOn' || key === 'purchaseDate') {
      row[key] = formatCsvDate(value);
      continue;
    }
    if (
      key.endsWith('Minor') ||
      key === 'estimatedCostMinor' ||
      key === 'purchasePriceMinor' ||
      key === 'monthlyCostMinor' ||
      key === 'costMinor'
    ) {
      row[key] = formatCsvAmount(value, record.data.currency);
      continue;
    }
    if (key === 'startsAt' || key === 'endsAt' || key === 'createdAt' || key === 'updatedAt') {
      row[key] = typeof value === 'string' ? formatCsvDate(value) : '';
      continue;
    }
    row[key] = cell(value);
  }
  return row;
}

/**
 * Builds a UTF-8 CSV with BOM and `;` separators for one export module (phase 2 §8.15).
 *
 * Preconditions: `records` belong to the same module (or are already filtered).
 * Postconditions: the file is not encrypted; sealed payloads are flagged, never inlined.
 * Data contract: first row is the header; dates use `gg/mm/aaaa`; amounts use a decimal comma.
 *
 * @param module - Export module label for empty files.
 * @param records - Rows to serialize.
 * @returns CSV text including the BOM.
 */
export function recordsToCsv(module: ExportModule, records: readonly ExportRecord[]): string {
  if (records.length === 0) {
    return `${BOM}modulo;tabella\n${module};\n`;
  }
  const rows = records.map(flattenRecord);
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const lines = [headers.join(';')];
  for (const row of rows) {
    lines.push(headers.map((header) => row[header] ?? '').join(';'));
  }
  return `${BOM}${lines.join('\n')}\n`;
}

/**
 * Triggers a browser download of a text or binary blob.
 *
 * @param filename - Suggested file name.
 * @param body - File contents.
 * @param mimeType - MIME type.
 */
export function downloadBlob(filename: string, body: BlobPart, mimeType: string): void {
  const blob = new Blob([body], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
