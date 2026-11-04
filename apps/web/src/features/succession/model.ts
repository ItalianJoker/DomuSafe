import { STANDARD_SUCCESSION_KINDS, type SuccessionItem, type SuccessionKind } from '@domusafe/contracts';
import { m } from '@/paraglide/messages.js';

const LONG_DIGIT_RUN = /\d{8,}/u;

/**
 * Whether text could carry a full account number or a similar secret.
 *
 * @param value - Text the person typed.
 * @returns `true` when eight or more digits appear in a row.
 */
export function hasLongDigitRun(value: string): boolean {
  return LONG_DIGIT_RUN.test(value);
}

/**
 * Name of a succession activity. A saved title replaces the standard name.
 *
 * @param item - Checklist row. A null title means the standard name.
 * @returns The words shown on the screen and on the kit.
 */
export function successionTitle(item: Pick<SuccessionItem, 'kind' | 'title'>): string {
  if (item.title !== null && item.title.trim() !== '') {
    return item.title;
  }
  return successionKindLabel(item.kind);
}

/**
 * Standard name of an activity kind.
 *
 * @param kind - Stored kind.
 * @returns The full phrase, without abbreviations.
 */
export function successionKindLabel(kind: SuccessionKind): string {
  switch (kind) {
    case 'documents':
      return m.successionKindDocuments();
    case 'will':
      return m.successionKindWill();
    case 'notary':
      return m.successionKindNotary();
    case 'titles':
      return m.successionKindTitles();
    case 'declaration':
      return m.successionKindDeclaration();
    case 'utility_transfers':
      return m.successionKindTransfers();
    case 'custom':
      return m.successionKindCustom();
  }
}

/** One line of the inheritance kit. Only checklist text is present. */
export interface InheritanceKitLine {
  readonly title: string;
  readonly notes: string | null;
  readonly deadlineNote: string | null;
  readonly done: boolean;
}

/**
 * Builds the inheritance kit from the checklist alone.
 *
 * Preconditions: `items` are the family's succession activities.
 * Postconditions: each line has a title, an optional note, an optional reminder and a done mark.
 * Data contract: vault documents, codes and account numbers are not fields of a line.
 *
 * @param items - Checklist rows, already in display order.
 * @returns The lines to print or save.
 */
export function inheritanceKitLines(items: readonly SuccessionItem[]): readonly InheritanceKitLine[] {
  return items.map((item) => ({
    title: successionTitle(item),
    notes: item.notes,
    deadlineNote: item.deadlineNote,
    done: item.done,
  }));
}

/**
 * Whether a standard activity is still missing.
 *
 * @param items - Active activities.
 * @returns `true` when preparing would add at least one standard activity.
 */
export function standardsMissing(items: readonly SuccessionItem[]): boolean {
  const present = new Set(items.map((item) => item.kind));
  return STANDARD_SUCCESSION_KINDS.some((kind) => !present.has(kind));
}
