import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import type { RecipeIngredient } from '@domusafe/contracts';

/** Parsed recipe fields extracted from a remote page. */
export interface ImportedRecipeDraft {
  readonly title: string;
  readonly description: string | null;
  readonly servings: number | null;
  readonly prepMinutes: number | null;
  readonly cookMinutes: number | null;
  readonly ingredients: readonly RecipeIngredient[];
  readonly steps: readonly string[];
  readonly sourceName: string | null;
}

/** Stable failure codes written on `recipe_imports.error_code`. */
export type RecipeImportErrorCode =
  'url_invalid' | 'host_blocked' | 'fetch_failed' | 'too_large' | 'no_recipe' | 'parse_failed';

const MAX_BYTES = 512 * 1024;
const FETCH_TIMEOUT_MS = 5_000;
const MAX_REDIRECTS = 3;

/**
 * Whether an IP address is private, loopback, link-local or otherwise unsafe for server-side fetch.
 *
 * @param address - IPv4 or IPv6 literal.
 * @returns `true` when the address must not be contacted.
 */
export function isBlockedAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const parts = address.split('.').map((part) => Number(part));
    const [a = 0, b = 0] = parts;
    if (a === 10 || a === 127 || a === 0) {
      return true;
    }
    if (a === 169 && b === 254) {
      return true;
    }
    if (a === 172 && b >= 16 && b <= 31) {
      return true;
    }
    if (a === 192 && b === 168) {
      return true;
    }
    if (a === 100 && b >= 64 && b <= 127) {
      return true;
    }
    return false;
  }
  if (version === 6) {
    const normalized = address.toLowerCase();
    return (
      normalized === '::1' ||
      normalized === '::' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe80') ||
      normalized.startsWith('::ffff:127.') ||
      normalized.startsWith('::ffff:10.') ||
      normalized.startsWith('::ffff:192.168.') ||
      /^::ffff:172\.(1[6-9]|2\d|3[0-1])\./.test(normalized)
    );
  }
  return true;
}

/**
 * Resolves a hostname and rejects blocked destinations.
 *
 * @param hostname - Host from the URL.
 * @returns The resolved address when safe.
 * @throws When DNS fails or the address is blocked.
 */
async function assertPublicHost(hostname: string): Promise<void> {
  if (isIP(hostname) !== 0) {
    if (isBlockedAddress(hostname)) {
      throw new Error('host_blocked');
    }
    return;
  }
  const lower = hostname.toLowerCase();
  if (lower === 'localhost' || lower.endsWith('.localhost') || lower.endsWith('.local')) {
    throw new Error('host_blocked');
  }
  const resolved = await lookup(hostname, { all: true });
  if (resolved.length === 0) {
    throw new Error('host_blocked');
  }
  for (const entry of resolved) {
    if (isBlockedAddress(entry.address)) {
      throw new Error('host_blocked');
    }
  }
}

function parseDurationMinutes(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 24 * 60) {
    return Math.round(value);
  }
  if (typeof value !== 'string') {
    return null;
  }
  const match = /^P(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)$/i.exec(value.trim());
  if (match === null) {
    return null;
  }
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  const total = hours * 60 + minutes + Math.round(seconds / 60);
  return total <= 24 * 60 ? total : null;
}

function parseServings(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 99) {
    return value;
  }
  if (typeof value === 'string') {
    const match = /(\d{1,2})/.exec(value);
    if (match !== null) {
      const n = Number(match[1]);
      if (n >= 1 && n <= 99) {
        return n;
      }
    }
  }
  return null;
}

function asText(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if ('text' in record) {
      return asText(record.text);
    }
    if ('@value' in record) {
      return asText(record['@value']);
    }
  }
  return null;
}

function parseIngredientLine(value: unknown): RecipeIngredient | null {
  if (typeof value === 'string') {
    const name = value.trim();
    if (name.length === 0 || name.length > 160) {
      return null;
    }
    return { name, quantity: null, unit: null, note: null };
  }
  if (value === null || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const name = asText(record.name) ?? asText(record.text);
  if (name === null || name.length > 160) {
    return null;
  }
  const quantityRaw = record.quantity ?? record.amount;
  let quantity: number | null = null;
  if (typeof quantityRaw === 'number' && Number.isFinite(quantityRaw) && quantityRaw > 0) {
    quantity = quantityRaw;
  } else if (typeof quantityRaw === 'string') {
    const parsed = Number(quantityRaw.replace(',', '.'));
    if (Number.isFinite(parsed) && parsed > 0) {
      quantity = parsed;
    }
  }
  const unit = asText(record.unit) ?? asText(record.unitText);
  const note = asText(record.note);
  return {
    name,
    quantity,
    unit: unit !== null && unit.length <= 40 ? unit : null,
    note: note !== null && note.length <= 200 ? note : null,
  };
}

function parseSteps(value: unknown): string[] {
  if (typeof value === 'string') {
    const text = value.trim();
    return text.length === 0 ? [] : [text.slice(0, 2000)];
  }
  if (!Array.isArray(value)) {
    return [];
  }
  const steps: string[] = [];
  for (const entry of value) {
    if (steps.length >= 200) {
      break;
    }
    if (typeof entry === 'string') {
      const text = entry.trim();
      if (text.length > 0) {
        steps.push(text.slice(0, 2000));
      }
      continue;
    }
    if (entry !== null && typeof entry === 'object') {
      const record = entry as Record<string, unknown>;
      const text = asText(record.text) ?? asText(record.name);
      if (text !== null) {
        steps.push(text.slice(0, 2000));
      }
    }
  }
  return steps;
}

function typeLabels(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string');
  }
  return [];
}

function recipeFromNode(node: Record<string, unknown>, pageUrl: string): ImportedRecipeDraft | null {
  const types = typeLabels(node['@type']);
  if (!types.some((item) => item.toLowerCase() === 'recipe')) {
    return null;
  }
  const title = asText(node.name);
  if (title === null || title.length > 160) {
    return null;
  }
  const description = asText(node.description);
  const ingredientsRaw = node.recipeIngredient ?? node.ingredients;
  const ingredients: RecipeIngredient[] = [];
  if (Array.isArray(ingredientsRaw)) {
    for (const line of ingredientsRaw) {
      if (ingredients.length >= 200) {
        break;
      }
      const parsed = parseIngredientLine(line);
      if (parsed !== null) {
        ingredients.push(parsed);
      }
    }
  }
  const steps = parseSteps(node.recipeInstructions ?? node.instructions);
  const sourceName =
    asText(node.author) ??
    (() => {
      try {
        return new URL(pageUrl).hostname;
      } catch {
        return null;
      }
    })();
  return {
    title,
    description: description === null ? null : description.slice(0, 4000),
    servings: parseServings(node.recipeYield ?? node.yield),
    prepMinutes: parseDurationMinutes(node.prepTime),
    cookMinutes: parseDurationMinutes(node.cookTime),
    ingredients,
    steps,
    sourceName: sourceName === null ? null : sourceName.slice(0, 160),
  };
}

function walkJsonLd(value: unknown, pageUrl: string): ImportedRecipeDraft | null {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = walkJsonLd(entry, pageUrl);
      if (found !== null) {
        return found;
      }
    }
    return null;
  }
  if (value === null || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const direct = recipeFromNode(record, pageUrl);
  if (direct !== null) {
    return direct;
  }
  if ('@graph' in record) {
    return walkJsonLd(record['@graph'], pageUrl);
  }
  return null;
}

/**
 * Extracts schema.org Recipe JSON-LD blocks from an HTML document without extra parsers.
 *
 * @param html - Raw HTML body.
 * @param pageUrl - Final URL after redirects.
 * @returns The first recipe found, or `null`.
 */
export function extractRecipeFromHtml(html: string, pageUrl: string): ImportedRecipeDraft | null {
  const marker = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = marker.exec(html)) !== null) {
    const start = match.index + match[0].length;
    const end = html.indexOf('</script>', start);
    if (end === -1) {
      continue;
    }
    const raw = html.slice(start, end).trim();
    if (raw.length === 0) {
      continue;
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      const recipe = walkJsonLd(parsed, pageUrl);
      if (recipe !== null) {
        return recipe;
      }
    } catch {
      continue;
    }
  }
  return null;
}

async function readLimitedBody(response: Response): Promise<string> {
  if (response.body === null) {
    return '';
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > MAX_BYTES) {
      throw new Error('too_large');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8');
}

/**
 * Fetches a public recipe page with SSRF protection and extracts a Recipe draft.
 *
 * Preconditions: `url` is an absolute http(s) URL already validated by Zod.
 * Postconditions: never contacts private, loopback or link-local addresses; body capped at 512 KiB.
 * Data contract: returns a draft suitable for `recipes` insert, or a stable error code.
 *
 * @param url - Page URL.
 * @returns Draft or error code.
 */
export async function importRecipeFromUrl(
  url: string,
): Promise<{ ok: true; draft: ImportedRecipeDraft } | { ok: false; code: RecipeImportErrorCode }> {
  let current: URL;
  try {
    current = new URL(url);
  } catch {
    return { ok: false, code: 'url_invalid' };
  }
  if (current.protocol !== 'http:' && current.protocol !== 'https:') {
    return { ok: false, code: 'url_invalid' };
  }

  try {
    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
      await assertPublicHost(current.hostname);
      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
      }, FETCH_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch(current, {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
          headers: {
            accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
            'user-agent': 'DomuSafeRecipeImport/1.0',
          },
        });
      } finally {
        clearTimeout(timer);
      }

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (location === null || redirect === MAX_REDIRECTS) {
          return { ok: false, code: 'fetch_failed' };
        }
        current = new URL(location, current);
        if (current.protocol !== 'http:' && current.protocol !== 'https:') {
          return { ok: false, code: 'url_invalid' };
        }
        continue;
      }

      if (!response.ok) {
        return { ok: false, code: 'fetch_failed' };
      }
      const contentType = response.headers.get('content-type') ?? '';
      if (
        !contentType.includes('text/html') &&
        !contentType.includes('application/xhtml+xml') &&
        contentType.length > 0
      ) {
        return { ok: false, code: 'no_recipe' };
      }
      const html = await readLimitedBody(response);
      const draft = extractRecipeFromHtml(html, current.toString());
      if (draft === null) {
        return { ok: false, code: 'no_recipe' };
      }
      return { ok: true, draft };
    }
    return { ok: false, code: 'fetch_failed' };
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'host_blocked') {
        return { ok: false, code: 'host_blocked' };
      }
      if (error.message === 'too_large') {
        return { ok: false, code: 'too_large' };
      }
    }
    return { ok: false, code: 'fetch_failed' };
  }
}
